using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using Microsoft.AspNetCore.Http.Features;
using TeacherHelp.Hubs;
using TeacherHelp.Session;

// Content root = katalog exe: wwwroot i appsettings.json są znajdowane niezależnie od katalogu,
// z którego uruchomiono program (dwuklik, skrót, Harmonogram zadań).
var builder = WebApplication.CreateBuilder(new WebApplicationOptions
{
    Args = args,
    ContentRootPath = AppContext.BaseDirectory,
});

// Ankieta „Co kumam” ma osobny port: te same adresy co aplikacja, tylko z portem ankiety.
// Pod IIS adresy ustawia się w powiązaniach witryny (deploy/Install-IIS.ps1).
var surveyPort = builder.Configuration.GetValue("TeacherHelp:SurveyPort", 5001);
builder.WebHost.UseUrls(WithSurveyPort(builder.Configuration[WebHostDefaults.ServerUrlsKey], surveyPort));

const long maxUploadBytes = 200L * 1024 * 1024;
const long maxImportBytes = 5L * 1024 * 1024;

builder.Services.AddSingleton<SessionService>();
builder.Services.AddSingleton(new FileStorage(Path.Combine(Path.GetTempPath(), "TeacherHelp", "files")));
builder.Services.Configure<FormOptions>(o => o.MultipartBodyLengthLimit = maxUploadBytes);
builder.Services.AddHostedService<SessionNotifier>();
builder.Services.AddSingleton<SurveyService>();
builder.Services.AddHostedService<SurveyNotifier>();
builder.Services.AddSignalR()
    .AddJsonProtocol(o => o.PayloadSerializerOptions.Converters.Add(new JsonStringEnumConverter()));
builder.Services
    .AddAuthentication(CookieAuthenticationDefaults.AuthenticationScheme)
    .AddCookie(options =>
    {
        options.Cookie.Name = "TeacherHelp.Teacher";
        options.Cookie.SameSite = SameSiteMode.Strict;
        options.ExpireTimeSpan = TimeSpan.FromHours(12);
        // API zwraca 401/403 zamiast przekierowania na stronę logowania.
        options.Events.OnRedirectToLogin = ctx => { ctx.Response.StatusCode = 401; return Task.CompletedTask; };
        options.Events.OnRedirectToAccessDenied = ctx => { ctx.Response.StatusCode = 403; return Task.CompletedTask; };
    });
builder.Services.AddAuthorization();

var app = builder.Build();

var teacherPassword = app.Configuration["TeacherHelp:TeacherPassword"] ?? "";
if (teacherPassword.Length == 0)
    app.Logger.LogWarning("Brak hasła nauczyciela (TeacherHelp:TeacherPassword) - logowanie do panelu będzie niemożliwe.");

// Na porcie ankiety te same adresy prowadzą do stron ankiety (uczeń: „/”, nauczyciel: „/teacher.html”).
app.Use((ctx, next) =>
{
    if (ctx.Connection.LocalPort == surveyPort)
        ctx.Request.Path = ctx.Request.Path.Value switch
        {
            "/" or "/index.html" => "/survey.html",
            "/teacher.html" => "/survey-teacher.html",
            _ => ctx.Request.Path,
        };
    return next();
});
app.UseDefaultFiles();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();

app.MapHub<StudentHub>("/hubs/student");
app.MapHub<TeacherHub>("/hubs/teacher");
app.MapHub<SurveyStudentHub>("/hubs/survey");
app.MapHub<SurveyTeacherHub>("/hubs/survey-teacher");

var teacher = app.MapGroup("/api/teacher");

teacher.MapPost("/login", async (LoginRequest req, HttpContext ctx) =>
{
    if (teacherPassword.Length == 0 || !PasswordMatches(req.Password ?? "", teacherPassword))
        return Results.Unauthorized();
    var identity = new ClaimsIdentity([new Claim(ClaimTypes.Role, "Teacher")], CookieAuthenticationDefaults.AuthenticationScheme);
    await ctx.SignInAsync(new ClaimsPrincipal(identity));
    return Results.NoContent();
});

teacher.MapPost("/logout", async (HttpContext ctx) =>
{
    await ctx.SignOutAsync();
    return Results.NoContent();
});

var secured = teacher.MapGroup("").RequireAuthorization();

secured.MapGet("/me", () => Results.NoContent());

secured.MapPost("/session/start", (StartRequest req, SessionService session) =>
{
    if (req.TaskCount < 1 || req.TaskCount > SessionService.MaxTasks)
        return Results.BadRequest($"Liczba zadań musi być od 1 do {SessionService.MaxTasks}.");
    return session.Start(req.TaskCount) ? Results.NoContent() : Results.Conflict("Sesja już trwa.");
});

// Wznowienie sesji z pliku z „Eksport CSV”. Formularz czytamy ręcznie, jak przy plikach (bez antiforgery).
secured.MapPost("/session/import", async (HttpRequest request, SessionService session, CancellationToken ct) =>
{
    if (!request.HasFormContentType) return Results.BadRequest("Oczekiwano formularza z plikiem.");
    var form = await request.ReadFormAsync(ct);
    if (form.Files.Count != 1) return Results.BadRequest("Wybierz jeden plik CSV.");
    if (form.Files[0].Length > maxImportBytes) return Results.BadRequest("Plik jest za duży jak na wyniki lekcji.");
    using var buffer = new MemoryStream();
    await form.Files[0].CopyToAsync(buffer, ct);
    try
    {
        return session.Import(DecodeCsv(buffer.ToArray())) ? Results.NoContent() : Results.Conflict("Sesja już trwa – najpierw ją zakończ.");
    }
    catch (FormatException e)
    {
        return Results.BadRequest(e.Message);
    }
});

secured.MapPost("/session/end", (SessionService session, FileStorage storage) =>
{
    if (!session.End()) return Results.Conflict("Brak aktywnej sesji.");
    storage.Clear();
    return Results.NoContent();
});

secured.MapPost("/tasks", (TaskRequest req, SessionService session) =>
    session.AddTask(req.Title) is { } task ? Results.Ok(task) : Results.Conflict("Brak aktywnej sesji lub limit zadań."));

secured.MapPut("/tasks/{number:int}", (int number, TaskRequest req, SessionService session) =>
    session.RenameTask(number, req.Title) ? Results.NoContent() : Results.NotFound());

secured.MapDelete("/students/{id}", (string id, SessionService session) =>
    session.RemoveStudent(id) ? Results.NoContent() : Results.NotFound());

secured.MapPost("/students/{id}/disconnect", (string id, SessionService session) =>
    session.DisconnectStudent(id) ? Results.NoContent() : Results.NotFound());

// Formularz czytamy ręcznie (bez bindowania IFormFile), żeby nie wymagać tokenów antiforgery.
secured.MapPost("/files", async (HttpRequest request, SessionService session, FileStorage storage, CancellationToken ct) =>
{
    if (!request.HasFormContentType) return Results.BadRequest("Oczekiwano formularza z plikami.");
    if (request.HttpContext.Features.Get<IHttpMaxRequestBodySizeFeature>() is { IsReadOnly: false } limit)
        limit.MaxRequestBodySize = maxUploadBytes; // domyślnie Kestrel przyjmuje ~30 MB
    var form = await request.ReadFormAsync(ct);
    int? taskNumber = int.TryParse(form["task"], out var n) ? n : null;
    if (form.Files.Count == 0) return Results.BadRequest("Nie wybrano pliku.");

    var added = new List<SharedFile>();
    foreach (var upload in form.Files)
    {
        var id = Guid.NewGuid().ToString("N");
        await using (var content = upload.OpenReadStream())
            await storage.SaveAsync(id, content, ct);
        if (session.AddFile(id, upload.FileName, upload.Length, taskNumber) is { } file) added.Add(file);
        else
        {
            storage.Delete(id);
            return Results.Conflict("Brak aktywnej sesji lub nie ma takiego zadania.");
        }
    }
    return Results.Ok(added);
});

secured.MapDelete("/files/{id}", (string id, SessionService session, FileStorage storage) =>
{
    if (!session.RemoveFile(id)) return Results.NotFound();
    storage.Delete(id);
    return Results.NoContent();
});

secured.MapGet("/export.csv", (SessionService session) =>
{
    var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(session.ExportCsv())).ToArray();
    return Results.File(bytes, "text/csv; charset=utf-8", $"teacher-help-{DateTime.Now:yyyy-MM-dd-HHmm}.csv");
});

secured.MapPost("/survey/start", (SurveyStartRequest req, SurveyService survey) =>
    survey.Start(req.Questions, req.Named)
        ? Results.NoContent()
        : Results.BadRequest($"Wpisz od 1 do {SurveyService.MaxQuestions} pytań."));

secured.MapPost("/survey/close", (SurveyService survey) =>
    survey.Close() ? Results.NoContent() : Results.Conflict("Brak otwartej ankiety."));

secured.MapGet("/survey/export.csv", (SurveyService survey) =>
{
    if (survey.ExportCsv() is not { } csv) return Results.NotFound();
    var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(csv)).ToArray();
    return Results.File(bytes, "text/csv; charset=utf-8", $"co-kumam-{DateTime.Now:yyyy-MM-dd-HHmm}.csv");
});

// Pobieranie plików przez uczniów: dostępne, dopóki trwa sesja. Zawsze jako załącznik (nie otwieramy HTML w przeglądarce).
app.MapGet("/api/files/{id}", (string id, SessionService session, FileStorage storage) =>
    session.GetFile(id) is { } file && storage.OpenRead(file.Id) is { } stream
        ? Results.File(stream, "application/octet-stream", file.Name)
        : Results.NotFound());

app.Run();

static bool PasswordMatches(string given, string expected) =>
    CryptographicOperations.FixedTimeEquals(SHA256.HashData(Encoding.UTF8.GetBytes(given)), SHA256.HashData(Encoding.UTF8.GetBytes(expected)));

// "http://0.0.0.0:5000" → "http://0.0.0.0:5000;http://0.0.0.0:5001". Bierzemy tylko adresy http
// (https z launchSettings na tym samym porcie co http dałby konflikt). Bez "Urls" – domyślny adres Kestrela.
static string WithSurveyPort(string? urls, int surveyPort)
{
    var list = (string.IsNullOrWhiteSpace(urls) ? "http://localhost:5000" : urls)
        .Split(';', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries).ToList();
    var survey = list
        .Where(u => u.StartsWith("http://", StringComparison.OrdinalIgnoreCase))
        .Select(u => Regex.Replace(u.TrimEnd('/'), @":\d+$", $":{surveyPort}"))
        .Where(u => !list.Contains(u, StringComparer.OrdinalIgnoreCase))
        .Distinct(StringComparer.OrdinalIgnoreCase);
    return string.Join(';', list.Concat(survey));
}

// Nasz eksport to UTF-8, ale plik zapisany ponownie w polskim Excelu bywa w Windows-1250.
static string DecodeCsv(byte[] bytes)
{
    try
    {
        return new UTF8Encoding(false, throwOnInvalidBytes: true).GetString(bytes);
    }
    catch (DecoderFallbackException)
    {
        return CodePagesEncodingProvider.Instance.GetEncoding(1250)!.GetString(bytes);
    }
}

record LoginRequest(string? Password);
record StartRequest(int TaskCount);
record TaskRequest(string? Title);
record SurveyStartRequest(string?[]? Questions, bool Named);

public partial class Program;
