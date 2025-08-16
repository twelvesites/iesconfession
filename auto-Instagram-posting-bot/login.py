import os
from instagrapi import Client

IG_USERNAME = os.environ.get("IG_USERNAME")
IG_PASSWORD = os.environ.get("IG_PASSWORD")

cl = Client()
cl.login(IG_USERNAME, IG_PASSWORD)

cl.dump_settings("auto-Instagram-posting-bot/ig_session.json")
print("Saved IG session!")
