using Google.Cloud.TextToSpeech.V1;
using TTSClient.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container.

builder.Services.AddControllers();
builder.Services.AddSingleton<TextToSpeechClient>(sp => TextToSpeechClient.Create());
builder.Services.AddSingleton<GoogleTTSService>(sp =>
    new GoogleTTSService(
        sp.GetRequiredService<TextToSpeechClient>(),
        testMode: false,
        testAudioPath: "C:\\temp\\temp.mp3"
      ));
builder.Services.AddOpenApi();

var app = builder.Build();

// Configure the HTTP request pipeline.
if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
}

app.UseHttpsRedirection();

app.UseAuthorization();

app.MapControllers();

app.Run();
