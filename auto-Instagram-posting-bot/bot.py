# auto-instagram-confession-bot.py
import os
import json
import warnings
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
import textwrap
import firebase_admin
from firebase_admin import credentials, firestore
from instagrapi import Client
from dotenv import load_dotenv

# --------------------------
# Load .env variables
# --------------------------
load_dotenv()
IG_USERNAME = os.environ.get("IG_USERNAME")
IG_PASSWORD = os.environ.get("IG_PASSWORD")
FIREBASE_JSON = os.environ.get("FIREBASE_JSON")
IG_SESSION_SECRET = os.environ.get("IG_SESSION_JSON")

# --------------------------
# Silence Firestore warnings
# --------------------------
warnings.filterwarnings(
    "ignore", category=UserWarning, module="google.cloud.firestore_v1.base_collection"
)

# --------------------------
# Instagram setup
# --------------------------
SESSION_FILE = "ig_session.json"
cl = Client()

def setup_ig_session():
    if IG_SESSION_SECRET:
        print("Loading session from GitHub Secret...")
        cl.set_settings(json.loads(IG_SESSION_SECRET))
        cl.login(IG_USERNAME, IG_PASSWORD)
        cl.dump_settings(SESSION_FILE)
    elif os.path.exists(SESSION_FILE):
        print("Loading session from local file...")
        cl.load_settings(SESSION_FILE)
        cl.login(IG_USERNAME, IG_PASSWORD)
    else:
        print("Fresh login...")
        cl.login(IG_USERNAME, IG_PASSWORD)
        cl.dump_settings(SESSION_FILE)
    print(f"Logged in as: {cl.username}")

setup_ig_session()

# --------------------------
# Firebase setup
# --------------------------
if not FIREBASE_JSON:
    raise RuntimeError("FIREBASE_JSON missing!")

cred_dict = json.loads(FIREBASE_JSON)
if "private_key" in cred_dict:
    cred_dict["private_key"] = cred_dict["private_key"].replace("\\n", "\n")
cred = credentials.Certificate(cred_dict)
if not firebase_admin._apps:
    firebase_admin.initialize_app(cred)

db = firestore.client()
print("✅ Connected to Firebase Firestore!")

# --------------------------
# Template & font paths
# --------------------------
BASE_DIR = Path(__file__).parent
TEMPLATE_PATH = BASE_DIR / "template.png"
OUTPUT_DIR = BASE_DIR / "cards"
OUTPUT_DIR.mkdir(exist_ok=True)

FONT_PATH = BASE_DIR / "SourceSansPro-Black.ttf"  # Bold font
EMOJI_DIR = BASE_DIR / "joypixels"  # JoyPixels PNGs

LINE_SPACING = 8
MAX_FONT_SIZE = 60
MIN_FONT_SIZE = 18

# CSS-like margin (top, right, bottom, left)
MARGIN = {"top": 140, "right": 5, "bottom": 140, "left": 5}

# --------------------------
# Emoji helpers
# --------------------------
UNICODE_EMOJI = {"😂","😭","❤️","👍","😎","😊","😅","🥲","🥰","😢","😍","🤔","🤣","🎀","🙂"}

def is_emoji(char):
    return char in UNICODE_EMOJI or ord(char) > 0x1F000

def get_emoji_path(char):
    hex_code = "-".join([f"{ord(c):x}" for c in char])
    path = EMOJI_DIR / f"{hex_code}.png"
    return path if path.exists() else None

# --------------------------
# Measure text size
# --------------------------
def measure_text_size(font, text):
    bbox = font.getbbox(text)
    width = bbox[2] - bbox[0]
    height = bbox[3] - bbox[1]
    return width, height

# --------------------------
# Generate confession card
# --------------------------
def generate_card(confession_text: str, output_name: str):
    template = Image.open(TEMPLATE_PATH).convert("RGBA")
    draw = ImageDraw.Draw(template)
    template_width, template_height = template.size

    # Safe area boundaries
    safe_left = MARGIN["left"]
    safe_top = MARGIN["top"]
    safe_right = template_width - MARGIN["right"]
    safe_bottom = template_height - MARGIN["bottom"]

    safe_width = safe_right - safe_left
    safe_height = safe_bottom - safe_top

    font_size = MAX_FONT_SIZE
    font = ImageFont.truetype(str(FONT_PATH), font_size)

    # -------------------
    # Shrink font until text fits inside safe area
    # -------------------
    while True:
        wrap_width = max(int(safe_width / font_size * 1.8), 10)
        wrapped = textwrap.fill(confession_text, width=wrap_width)
        lines = wrapped.split("\n")
        total_h = sum(measure_text_size(font, line)[1] + LINE_SPACING for line in lines)

        if total_h <= safe_height or font_size <= MIN_FONT_SIZE:
            break

        font_size = max(int(font_size * 0.9), MIN_FONT_SIZE)
        font = ImageFont.truetype(str(FONT_PATH), font_size)

    # Vertical starting point for exact center
    y = safe_top + (safe_height - total_h) // 2

    # -------------------
    # Draw lines and emojis
    # -------------------
    for line in lines:
        line_width = 0
        for char in line:
            if is_emoji(char):
                emoji_path = get_emoji_path(char)
                line_width += font_size if emoji_path else measure_text_size(font, char)[0]
            else:
                line_width += measure_text_size(font, char)[0]

        x = safe_left + (safe_width - line_width) // 2

        for char in line:
            if is_emoji(char):
                emoji_path = get_emoji_path(char)
                if emoji_path:
                    emoji_img = Image.open(emoji_path).convert("RGBA")
                    emoji_img = emoji_img.resize((font_size, font_size), Image.Resampling.LANCZOS)
                    template.paste(emoji_img, (x, y), emoji_img)
                    x += font_size
                else:
                    w, _ = measure_text_size(font, char)
                    draw.text((x, y), char, font=font, fill=(255, 221, 206))
                    draw.text((x + 1, y), char, font=font, fill=(255, 221, 206))
                    x += w
            else:
                w, _ = measure_text_size(font, char)
                draw.text((x, y), char, font=font, fill=(255, 221, 206))
                draw.text((x + 1, y), char, font=font, fill=(255, 221, 206))
                x += w

        y += font_size + LINE_SPACING

    out_path = OUTPUT_DIR / f"{output_name}.png"
    template.save(out_path, format="PNG")
    return out_path

# --------------------------
# Post new confessions
# --------------------------
def post_new_confessions(limit: int = 3):
    print("🔍 Fetching unposted confessions...")
    docs = list(
        db.collection("newconfessions")
        .where("posted", "==", False)
        .limit(limit)
        .stream()
    )

    if not docs:
        print("ℹ️ No new confessions found.")
        return

    for doc in docs:
        data = doc.to_dict()
        text = data.get("text", "").strip()
        if not text:
            continue

        try:
            file_name = f"{doc.id}"
            card_path = generate_card(text, file_name)
            caption = "Anonymous confession 💌"
            media = cl.photo_upload(str(card_path), caption=caption)
            print(f"✅ Posted confession: {text[:50]}...")

            doc.reference.update({
                "posted": True,
                "instagram_media_id": str(media.dict().get("pk"))
            })
            print("✔ Firestore updated")
        except Exception as e:
            print(f"❌ Error posting confession {doc.id}: {e}")

# --------------------------
# Run bot
# --------------------------
if __name__ == "__main__":
    post_new_confessions()
    print("🎉 All new confessions processed!")
