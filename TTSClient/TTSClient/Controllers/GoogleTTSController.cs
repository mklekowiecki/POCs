using Microsoft.AspNetCore.Mvc;
using TTSClient.Services;
using Google.Cloud.TextToSpeech.V1;
using System.Buffers;

namespace TTSClient.Controllers
{
    [ApiController]
    [Route("[controller]")]
    public class GoogleTTSController : ControllerBase
    {
        private readonly GoogleTTSService _ttsService;

        public GoogleTTSController(GoogleTTSService ttsService)
        {
            _ttsService = ttsService;
        }

        [HttpPost("stream")]
        public async Task StreamTTS([FromBody] string text)
        {
            Response.ContentType = "audio/wav";
            var audioStream = await _ttsService.SynthesizeSpeechStreamAsync(text);
            var buffer = new byte[8192];
            int bytesRead;
            while ((bytesRead = await audioStream.ReadAsync(buffer, 0, buffer.Length)) > 0)
            {
                await Response.Body.WriteAsync(buffer.AsMemory(0, bytesRead));
                await Response.Body.FlushAsync();
            }
        }
    }
}
