using System.Net.Http;
using System.Threading.Tasks;
using Microsoft.Maui.Controls;
using Plugin.Maui.Audio;
using System.IO;

namespace TTSClientMaui;

public partial class MainPage : ContentPage
{
	int count = 0;
	private readonly HttpClient _httpClient = new HttpClient();
	private readonly IAudioPlayer _audioPlayer;

	public MainPage()
	{
		InitializeComponent();
		_audioPlayer = AudioManager.Current.CreatePlayer(Stream.Null);
	}

	private async void OnSpeakClicked(object sender, EventArgs e)
	{
		var text = TextEntry.Text;
		if (string.IsNullOrWhiteSpace(text)) return;

		var request = new StringContent($"\"{text}\"", System.Text.Encoding.UTF8, "application/json");
		var response = await _httpClient.PostAsync("http://localhost:5116/GoogleTTS/stream", request);
		response.EnsureSuccessStatusCode();
		using var audioStream = await response.Content.ReadAsStreamAsync();
		_audioPlayer.Stop();
		_audioPlayer.Dispose();
		var player = AudioManager.Current.CreatePlayer(audioStream);
		player.Play();
	}
}
