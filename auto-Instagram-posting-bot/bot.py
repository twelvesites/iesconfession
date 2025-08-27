import os
import json
import textwrap
import warnings
from instagrapi import Client
from PIL import Image, ImageDraw, ImageFont
import firebase_admin
from firebase_admin import credentials, firestore
from dotenv import load_dotenv

# --------------------------
# Load .env variables (for local run)
# --------------------------
load_dotenv()
IG_USERNAME = os.environ.get("IG_USERNAME")
IG_PASSWORD = os.environ.get("IG_PASSWORD")
FIREBASE_JSON = os.environ.get("FIREBASE_JSON")
IG_SESSION_SECRET = os.environ.get("IG_SESSION_JSON")  # GitHub secret

# --------------------------
# Silence Firestore warnings
# --------------------------
warnings.filterwarnings(
    "ignore", category=UserWarning, module="google.cloud.firestore_v1.base_collection"
)

# --------------------------
# Instagram session setup
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

# 🔥 Fix PEM key newlines
if "private_key" in cred_dict:
    cred_dict["private_key"] = cred_dict["private_key"].replace("\\n", "\n")

cred = credentials.Certificate(cred_dict)
if not firebase_admin._apps:
    firebase_admin.initialize_app(cred)

db = firestore.client()
print("✅ Connected to Firebase Firestore!")

# --------------------------
# Template & font settings
# --------------------------
TEMPLATE_PATH = os.path.join(os.path.dirname(__file__), "template.png")
FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"  # original font
LINE_SPACING = 10
MAX_HEIGHT = 900

# --------------------------
# Generate confession card
# --------------------------
def generate_card(confession_text: str, output_path="confession_card.jpg") -> str:
    template = Image.open(TEMPLATE_PATH).convert("RGB")
    draw = ImageDraw.Draw(template)

    font_size = 48
    wrapped = None
    lines = None
    while font_size >= 20:
        font = ImageFont.truetype(FONT_PATH, font_size)
        # Wrap text nicely; caps or long text handled automatically
        wrapped = textwrap.fill(confession_text, width=35)
        lines = wrapped.split("\n")
        total_h = sum(font.getbbox(line)[3] + LINE_SPACING for line in lines)
        if total_h <= MAX_HEIGHT:
            break
        font_size -= 2

    # Vertical centering
    y = (template.height - total_h) // 2
    for line in lines:
        bbox = font.getbbox(line)
        w, h = bbox[2] - bbox[0], bbox[3] - bbox[1]
        x = (template.width - w) // 2
        draw.text((x, y), line, font=font, fill=(255, 255, 255))
        y += h + LINE_SPACING

    template.save(output_path, format="JPEG", quality=90)
    return output_path

# --------------------------
# Post new confessions
# --------------------------
def post_new_confessions():
    print("🔍 Fetching unposted confessions...")
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

# --------------------------
# Run bot
# --------------------------
if __name__ == "__main__":
    post_new_confessions()
    print("🎉 All new confessions processed!")
