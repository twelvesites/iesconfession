import os
import json
import textwrap
from instagrapi import Client
from PIL import Image, ImageDraw, ImageFont
import firebase_admin
from firebase_admin import credentials, firestore

# --------------------------
# Instagram credentials from GitHub Actions secrets
# --------------------------
IG_USERNAME = os.environ.get("IG_USERNAME")
IG_PASSWORD = os.environ.get("IG_PASSWORD")
SESSION_FILE = "auto-Instagram-posting-bot/ig_session.json"

# --------------------------
# Login to Instagram using saved session
# --------------------------
cl = Client()

try:
    if os.path.exists(SESSION_FILE):
        cl.load_settings(SESSION_FILE)
        try:
            cl.login(IG_USERNAME, IG_PASSWORD)
            print("Logged in using saved session!")
        except Exception as e:
            print("Warning: Could not login with session. Skipping Instagram posts.", e)
    else:
        cl.login(IG_USERNAME, IG_PASSWORD)
        cl.dump_settings(SESSION_FILE)
        print("Logged in and saved session!")
except Exception as e:
    print("Instagram login skipped due to CI restrictions:", e)
    cl = None  # Mark Instagram client as unavailable

# --------------------------
# Firebase setup from GitHub secret
# --------------------------
try:
    firebase_json_str = os.environ.get("FIREBASE_JSON")
    cred_dict = json.loads(firebase_json_str)
    cred = credentials.Certificate(cred_dict)
    firebase_admin.initialize_app(cred)
    db = firestore.client()
    print("Connected to Firebase Firestore!")
except Exception as e:
    print("Firebase initialization failed:", e)
    db = None

# --------------------------
# Template settings
# --------------------------
TEMPLATE_PATH = "template.png"
FONT_PATH = "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf"
MAX_WIDTH = 900
MAX_HEIGHT = 900
FONT_SIZE = 48
LINE_SPACING = 10

# --------------------------
# Generate confession card
# --------------------------
def generate_card(confession_text, output_path="confession_card.png"):
    template = Image.open(TEMPLATE_PATH).convert("RGB")
    draw = ImageDraw.Draw(template)

    wrapped_text = textwrap.fill(confession_text, width=35)
    font_size = FONT_SIZE
    font = ImageFont.truetype(FONT_PATH, font_size)

    while True:
        lines = wrapped_text.split("\n")
        total_height = sum([draw.textsize(line, font=font)[1] + LINE_SPACING for line in lines])
        if total_height <= MAX_HEIGHT or font_size <= 20:
            break
        font_size -= 2
        font = ImageFont.truetype(FONT_PATH, font_size)

    y_start = (template.height - total_height) // 2
    for line in lines:
        w, h = draw.textsize(line, font=font)
        x = (template.width - w) // 2
        draw.text((x, y_start), line, font=font, fill=(255, 255, 255))
        y_start += h + LINE_SPACING

    template.save(output_path)
    return output_path

# --------------------------
# Post new confessions
# --------------------------
def post_new_confessions():
    if db is None:
        print("Firestore not initialized, skipping confessions.")
        return

    confessions_ref = db.collection("newconfessions")
    query = confessions_ref.where("posted", "==", False).stream()

    for doc in query:
        data = doc.to_dict()
        text = data.get("text", "")
        if not text.strip():
            continue

        try:
            card_path = generate_card(text)
            caption = "Anonymous confession 💌"

            if cl:
                cl.photo_upload(card_path, caption=caption)
                print(f"Posted confession: {text[:50]}...")
            else:
                print(f"Skipped posting to Instagram (CI blocked): {text[:50]}...")

            doc.reference.update({"posted": True})
            print("Marked as posted in Firebase.")

        except Exception as e:
            print(f"Error posting confession {doc.id}: {e}")

# --------------------------
# Run the bot
# --------------------------
if __name__ == "__main__":
    post_new_confessions()
    print("All new confessions processed!")
