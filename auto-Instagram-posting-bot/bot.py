import os
import json
import textwrap
import warnings
from pathlib import Path
from instagrapi import Client
from PIL import Image, ImageDraw, ImageFont
import firebase_admin
from firebase_admin import credentials, firestore

# --------------------------
# Silence noisy warnings
# --------------------------
warnings.filterwarnings(
    "ignore", category=UserWarning, module="google.cloud.firestore_v1.base_collection"
)

# --------------------------
# Instagram setup
# --------------------------
IG_USERNAME = os.environ.get("IG_USERNAME")
IG_PASSWORD = os.environ.get("IG_PASSWORD")
SESSION_FILE = Path("ig_session.json")

cl = Client()

if SESSION_FILE.exists():
    try:
        cl.load_settings(str(SESSION_FILE))
        cl.login(IG_USERNAME, IG_PASSWORD)
        print("✅ Logged in using saved session")
    except Exception:
        print("⚠️ Session file invalid, re-logging in...")
        cl.login(IG_USERNAME, IG_PASSWORD)
        cl.dump_settings(str(SESSION_FILE))
else:
    cl.login(IG_USERNAME, IG_PASSWORD)
    cl.dump_settings(str(SESSION_FILE))
    print("✅ Logged in and saved session")

# --------------------------
# Firebase setup
# --------------------------
firebase_json_str = os.environ.get("FIREBASE_JSON")
if not firebase_json_str:
    raise RuntimeError("❌ FIREBASE_JSON secret not set!")

try:
    cred_dict = json.loads(firebase_json_str)
except json.JSONDecodeError:
    # handle GitHub escaping issues
    cred_dict = json.loads(firebase_json_str.strip())

cred = credentials.Certificate(cred_dict)

if not firebase_admin._apps:
    firebase_admin.initialize_app(cred)

db = firestore.client()
print("✅ Connected to Firebase")

# --------------------------
# Template / font settings
# --------------------------
TEMPLATE_PATH = "template.png"
FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
LINE_SPACING = 10
MAX_HEIGHT = 900


def generate_card(confession_text: str, output_path="confession_card.jpg") -> str:
    template = Image.open(TEMPLATE_PATH).convert("RGB")
    draw = ImageDraw.Draw(template)

    # wrap + resize text until it fits
    font_size = 48
    while font_size >= 20:
        font = ImageFont.truetype(FONT_PATH, font_size)
        wrapped = textwrap.fill(confession_text, width=35)
        lines = wrapped.split("\n")
        total_h = sum(draw.textsize(line, font=font)[1] + LINE_SPACING for line in lines)
        if total_h <= MAX_HEIGHT:
            break
        font_size -= 2

    y = (template.height - total_h) // 2
    for line in lines:
        w, h = draw.textsize(line, font=font)
        x = (template.width - w) // 2
        draw.text((x, y), line, font=font, fill=(255, 255, 255))
        y += h + LINE_SPACING

    template.save(output_path, format="JPEG", quality=90)
    return output_path


def post_new_confessions():
    print("🔍 Fetching unposted confessions...")
    # timeout safeguard
    confessions_ref = db.collection("newconfessions").where("posted", "==", False).limit(3)

    docs = list(confessions_ref.stream())
    if not docs:
        print("ℹ️ No new confessions found.")
        return

    for doc in docs:
        data = doc.to_dict()
        text = data.get("text", "").strip()
        if not text:
            continue

        try:
            card_path = generate_card(text)
            caption = "Anonymous confession 💌"
            media = cl.photo_upload(card_path, caption=caption)
            print(f"✅ Posted confession: {text[:50]}...")

            doc.reference.update({
                "posted": True,
                "instagram_media_id": str(media.dict().get("pk"))
            })
            print("✔ Firestore updated")
        except Exception as e:
            print(f"❌ Error posting confession {doc.id}: {e}")


if __name__ == "__main__":
    post_new_confessions()
    print("🎉 Done")
