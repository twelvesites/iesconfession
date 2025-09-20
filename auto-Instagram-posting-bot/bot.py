# auto-instagram-confession-bot.py
import os
import json
import warnings
from pathlib import Path
from io import BytesIO
import textwrap
import requests
from PIL import Image, ImageDraw, ImageFont
import firebase_admin
from firebase_admin import credentials, firestore
from instagrapi import Client
from dotenv import load_dotenv

# --------------------------
# Load .env / GitHub secrets
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
TEXT_TEMPLATE_PATH = BASE_DIR / "template.png"
IMAGE_TEMPLATE_PATH = BASE_DIR / "tempimage.png"
OUTPUT_DIR = BASE_DIR / "cards"
OUTPUT_DIR.mkdir(exist_ok=True)

FONT_PATH = BASE_DIR / "SourceSansPro-Black.ttf"
EMOJI_DIR = BASE_DIR / "joypixels"

LINE_SPACING = 8
MAX_FONT_SIZE = 60
MIN_FONT_SIZE = 18
MARGIN = {"top": 140, "right": 5, "bottom": 140, "left": 5}
UNICODE_EMOJI = {"😂","😭","❤️","👍","😎","😊","😅","🥲","🥰","😢","😍","🤔","🤣","🎀","🙂"}

# --------------------------
# Emoji helpers
# --------------------------
def is_emoji(char):
    return char in UNICODE_EMOJI or ord(char) > 0x1F000

def get_emoji_path(char):
    hex_code = "-".join([f"{ord(c):x}" for c in char])
    path = EMOJI_DIR / f"{hex_code}.png"
    return path if path.exists() else None

def measure_text_size(font, text):
    bbox = font.getbbox(text)
    return bbox[2]-bbox[0], bbox[3]-bbox[1]

# --------------------------
# Generate card
# --------------------------
def generate_card(confession_text: str, image_url: str, output_name: str) -> Path:
    # Load base image
    if image_url:
        try:
            response = requests.get(image_url)
            response.raise_for_status()
            base_img = Image.open(BytesIO(response.content)).convert("RGBA")
        except Exception as e:
            print(f"❌ Failed to download image: {e}")
            base_img = Image.new("RGBA", (1080, 1080), (0, 0, 0, 255))
    else:
        base_img = Image.open(TEXT_TEMPLATE_PATH).convert("RGBA")

    # Overlay template properly
    try:
        template = Image.open(IMAGE_TEMPLATE_PATH).convert("RGBA")
        scale_w = base_img.width / template.width
        scale_h = base_img.height / template.height
        scale_factor = min(scale_w, scale_h)
        new_size = (int(template.width * scale_factor), int(template.height * scale_factor))
        template = template.resize(new_size, Image.Resampling.LANCZOS)
        x = (base_img.width - template.width) // 2
        y = (base_img.height - template.height) // 2
        base_img.paste(template, (x, y), template)
    except Exception as e:
        print(f"❌ Failed to apply image template: {e}")

    # Draw text
    if confession_text:
        draw = ImageDraw.Draw(base_img)
        w, h = base_img.size
        font_size = MAX_FONT_SIZE
        font = ImageFont.truetype(str(FONT_PATH), font_size)
        safe_w = w - MARGIN["left"] - MARGIN["right"]
        safe_h = h - MARGIN["top"] - MARGIN["bottom"]

        while True:
            wrap_width = max(int(safe_w / font_size * 1.8), 10)
            lines = textwrap.fill(confession_text, width=wrap_width).split("\n")
            total_h = sum(measure_text_size(font, l)[1] + LINE_SPACING for l in lines)
            if total_h <= safe_h or font_size <= MIN_FONT_SIZE:
                break
            font_size = max(int(font_size * 0.9), MIN_FONT_SIZE)
            font = ImageFont.truetype(str(FONT_PATH), font_size)

        y = MARGIN["top"] + (safe_h - total_h) // 2
        for line in lines:
            line_width = sum(font_size if is_emoji(c) else measure_text_size(font, c)[0] for c in line)
            x = MARGIN["left"] + (safe_w - line_width) // 2
            for char in line:
                if is_emoji(char):
                    emoji_path = get_emoji_path(char)
                    if emoji_path:
                        em_img = Image.open(emoji_path).convert("RGBA")
                        em_img = em_img.resize((font_size, font_size), Image.Resampling.LANCZOS)
                        base_img.paste(em_img, (x, y), em_img)
                        x += font_size
                    else:
                        w_c, _ = measure_text_size(font, char)
                        draw.text((x, y), char, font=font, fill=(210, 140, 255))
                        x += w_c
                else:
                    w_c, _ = measure_text_size(font, char)
                    draw.text((x, y), char, font=font, fill=(210, 140, 255))
                    x += w_c
            y += font_size + LINE_SPACING

    out_path = OUTPUT_DIR / f"{output_name}.png"
    base_img.save(out_path, format="PNG")
    return out_path

# --------------------------
# Post new confessions
# --------------------------
def post_new_confessions(limit: int = 3):
    print("🔍 Fetching unposted confessions...")
    docs = list(
        db.collection("confession")
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
        image_url = data.get("imageURL", "").strip()
        status = data.get("status", "")
        if not text and not image_url:
            continue

        try:
            file_name = f"{doc.id}"
            card_path = generate_card(text, image_url if status=="approved" else "", file_name)
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
