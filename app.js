{
  "name": "brisaplan",
  "version": "9.0.0",
  "description": "Organizador personal minimalista, PWA y app Android nativa.",
  "main": "www/index.html",
  "scripts": {
    "build": "echo 'Static build ready in www/'",
    "cap:sync": "npx cap sync android"
  },
  "dependencies": {
    "@capacitor/android": "^6.0.0",
    "@capacitor/core": "^6.0.0",
    "@capacitor/local-notifications": "^6.0.0",
    "@capacitor/preferences": "^6.0.0",
    "@codetrix-studio/capacitor-google-auth": "^3.4.0-rc.4",
    "firebase": "^10.14.1"
  },
  "devDependencies": {
    "@capacitor/cli": "^6.0.0"
  }
}
