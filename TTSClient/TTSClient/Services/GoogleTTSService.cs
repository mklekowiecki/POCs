using Google.Cloud.TextToSpeech.V1;
using Google.Protobuf;
using System.Threading.Tasks;
using System.IO;

namespace TTSClient.Services
{
    public class GoogleTTSService
    {
        private readonly TextToSpeechClient _client;
        private readonly bool _testMode;
        private readonly string _testAudioPath;

        public GoogleTTSService(TextToSpeechClient client, bool testMode = false, string testAudioPath = "test.mp3")
        {
            _client = client;
            _testMode = testMode;
            _testAudioPath = testAudioPath;
        }

        public async Task<Stream> SynthesizeSpeechStreamAsync(string text)
        {
            if (_testMode)
            {
                // Return static MP3 file as stream
                var audioStreamTest = new FileStream(_testAudioPath, FileMode.Open, FileAccess.Read, FileShare.Read);
                return audioStreamTest;
            }

            var input = new SynthesisInput { Text = text };
            var voice = new VoiceSelectionParams { LanguageCode = "pl", SsmlGender = SsmlVoiceGender.Female };
            var audioConfig = new AudioConfig { AudioEncoding = AudioEncoding.Linear16 };

            var response = await _client.SynthesizeSpeechAsync(input, voice, audioConfig);
            var audioStream = new MemoryStream(response.AudioContent.ToByteArray());
            audioStream.Position = 0;
            return audioStream;
        }
    }
}
