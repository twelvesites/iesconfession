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

# ----------------------------------------------------
# Load env / GitHub secrets
# ----------------------------------------------------
load_dotenv()
IG_USERNAME = os.environ.get("IG_USERNAME")
IG_PASSWORD = os.environ.get("IG_PASSWORD")
FIREBASE_JSON = os.environ.get("FIREBASE_JSON")
IG_SESSION_SECRET = os.environ.get("IG_SESSION_JSON")

# ----------------------------------------------------
# Silence Firestore warnings
# ----------------------------------------------------
warnings.filterwarnings(
    "ignore", category=UserWarning, module="google.cloud.firestore_v1.base_collection"
)

# ----------------------------------------------------
# Instagram client
# ----------------------------------------------------
SESSION_FILE = "ig_session.json"
cl = Client()


def setup_ig_session():
    if IG_SESSION_SECRET:
        print("Loading IG session from secret…")
        cl.set_settings(json.loads(IG_SESSION_SECRET))
        cl.login(IG_USERNAME, IG_PASSWORD)
        cl.dump_settings(SESSION_FILE)
    elif os.path.exists(SESSION_FILE):
        cl.load_settings(SESSION_FILE)
        cl.login(IG_USERNAME, IG_PASSWORD)
    else:
        cl.login(IG_USERNAME, IG_PASSWORD)
        cl.dump_settings(SESSION_FILE)
    print(f"✅ Logged in as {cl.username}")


setup_ig_session()

# ----------------------------------------------------
# Firebase
# ----------------------------------------------------
if not FIREBASE_JSON:
    raise RuntimeError("FIREBASE_JSON missing!")
cred_dict = json.loads(FIREBASE_JSON)
if "private_key" in cred_dict:
    cred_dict["private_key"] = cred_dict["private_key"].replace("\\n", "\n")
cred = credentials.Certificate(cred_dict)
if not firebase_admin._apps:
    firebase_admin.initialize_app(cred)
db = firestore.client()
print("✅ Connected to Firestore")

# ----------------------------------------------------
# Paths / constants
# ----------------------------------------------------
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
UNICODE_EMOJI = {
    "😂", "😭", "❤️", "👍", "😎", "😊", "😅",
    "🥲", "🥰", "😢", "😍", "🤔", "🤣", "🎀", "🙂"
}


# ----------------------------------------------------
# Emoji helpers
# ----------------------------------------------------
def is_emoji(ch: str) -> bool:
    return ch in UNICODE_EMOJI or ord(ch) > 0x1F000


def get_emoji_path(ch: str):
    hex_code = "-".join(f"{ord(c):x}" for c in ch)
    p = EMOJI_DIR / f"{hex_code}.png"
    return p if p.exists() else None


def measure_text_size(font, txt):
    bbox = font.getbbox(txt)
    return bbox[2] - bbox[0], bbox[3] - bbox[1]


# ----------------------------------------------------
# Card generator
# ----------------------------------------------------
def generate_card(confession_text: str, image_url: str, out_name: str) -> Path:
    """
    - if image_url provided → use it as background and overlay tempimage.png
    - else → start from template.png
    """
    if image_url:
        # download base image
        try:
            resp = requests.get(image_url, timeout=10)
            resp.raise_for_status()
            base_img = Image.open(BytesIO(resp.content)).convert("RGBA")
        except Exception as e:
            print(f"❌ Couldn't load image: {e}")
            base_img = Image.new("RGBA", (1080, 1080), (0, 0, 0, 255))

        # overlay tempimage scaled full width, centered vertically
        try:
            overlay = Image.open(IMAGE_TEMPLATE_PATH).convert("RGBA")
            scale = base_img.width / overlay.width
            new_h = int(overlay.height * scale)
            overlay = overlay.resize((base_img.width, new_h), Image.Resampling.LANCZOS)
            y = (base_img.height - overlay.height) // 2
            base_img.paste(overlay, (0, y), overlay)
        except Exception as e:
            print(f"❌ Failed overlay: {e}")
    else:
        base_img = Image.open(TEXT_TEMPLATE_PATH).convert("RGBA")

    # Draw text if present
    if confession_text:
        draw = ImageDraw.Draw(base_img)
        w, h = base_img.size
        font_size = MAX_FONT_SIZE
        font = ImageFont.truetype(str(FONT_PATH), font_size)
        safe_w = w - MARGIN["left"] - MARGIN["right"]
        safe_h = h - MARGIN["top"] - MARGIN["bottom"]

        while True:
            wrap_w = max(int(safe_w / font_size * 1.8), 10)
            lines = textwrap.fill(confession_text, width=wrap_w).split("\n")
            total_h = sum(measure_text_size(font, l)[1] + LINE_SPACING for l in lines)
            if total_h <= safe_h or font_size <= MIN_FONT_SIZE:
                break
            font_size = max(int(font_size * 0.9), MIN_FONT_SIZE)
            font = ImageFont.truetype(str(FONT_PATH), font_size)

        y = MARGIN["top"] + (safe_h - total_h) // 2
        for line in lines:
            line_w = sum(
                font_size if is_emoji(c) else measure_text_size(font, c)[0]
                for c in line
            )
            x = MARGIN["left"] + (safe_w - line_w) // 2
            for char in line:
                if is_emoji(char):
                    epath = get_emoji_path(char)
                    if epath:
                        em = Image.open(epath).convert("RGBA")
                        em = em.resize((font_size, font_size), Image.Resampling.LANCZOS)
                        base_img.paste(em, (x, y), em)
                        x += font_size
                    else:
                        cw, _ = measure_text_size(font, char)
                        draw.text((x, y), char, font=font, fill=(210, 140, 255))
                        x += cw
                else:
                    cw, _ = measure_text_size(font, char)
                    draw.text((x, y), char, font=font, fill=(210, 140, 255))
                    x += cw
            y += font_size + LINE_SPACING

    out_path = OUTPUT_DIR / f"{out_name}.png"
    base_img.save(out_path, format="PNG")
    return out_path


# ----------------------------------------------------
# Post to IG
# ----------------------------------------------------
def post_new_confessions(limit: int = 3):
    print("🔍 Looking for unposted confessions…")
    docs = list(
        db.collection("confession")
        .where("posted", "==", False)
        .limit(limit)
        .stream()
    )
    if not docs:
        print("ℹ️ Nothing new.")
        return

    for doc in docs:
        data = doc.to_dict()
        txt = data.get("text", "").strip()
        img_url = data.get("imageURL", "").strip()
        status = data.get("status", "")
        if not txt and not img_url:
            continue

        try:
            name = doc.id
            card = generate_card(txt, img_url if status == "approved" else "", name)
            media = cl.photo_upload(str(card), caption="Anonymous confession 💌")
            doc.reference.update({
                "posted": True,
                "instagram_media_id": str(media.dict().get("pk"))
            })
            print(f"✅ Posted {doc.id}")
        except Exception as e:
            print(f"❌ Error posting {doc.id}: {e}")


# ----------------------------------------------------
# Main
# ----------------------------------------------------
if __name__ == "__main__":
    post_new_confessions()
    print("🎉 All new confessions processed!")
