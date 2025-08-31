For configuration purpose please:
- Open Google Console
- Choose project
- Switch to Section IAM & Admin
- Add Service Account, set privileges for TTS
- Generate JSON file with key
- Set environment variable via command line with path to key file:
  setx GOOGLE_APPLICATION_CREDENTIALS "C:\path\key__file.json"
