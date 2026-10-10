using System.Security.Claims;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Authentication;
using Microsoft.AspNetCore.Authentication.Cookies;
using TeacherHelp.Hubs;
using TeacherHelp.Session;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddSingleton<SessionService>();
builder.Services.AddHostedService<SessionNotifier>();
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

app.UseDefaultFiles();
app.UseStaticFiles();
app.UseAuthentication();
app.UseAuthorization();

app.MapHub<StudentHub>("/hubs/student");
app.MapHub<TeacherHub>("/hubs/teacher");

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

secured.MapPost("/session/end", (SessionService session) =>
    session.End() ? Results.NoContent() : Results.Conflict("Brak aktywnej sesji."));

secured.MapPost("/tasks", (TaskRequest req, SessionService session) =>
    session.AddTask(req.Title) is { } task ? Results.Ok(task) : Results.Conflict("Brak aktywnej sesji lub limit zadań."));

secured.MapPut("/tasks/{number:int}", (int number, TaskRequest req, SessionService session) =>
    session.RenameTask(number, req.Title) ? Results.NoContent() : Results.NotFound());

secured.MapDelete("/students/{id}", (string id, SessionService session) =>
    session.RemoveStudent(id) ? Results.NoContent() : Results.NotFound());

secured.MapGet("/export.csv", (SessionService session) =>
{
    var bytes = Encoding.UTF8.GetPreamble().Concat(Encoding.UTF8.GetBytes(session.ExportCsv())).ToArray();
    return Results.File(bytes, "text/csv; charset=utf-8", $"teacher-help-{DateTime.Now:yyyy-MM-dd-HHmm}.csv");
});

app.Run();

static bool PasswordMatches(string given, string expected) =>
    CryptographicOperations.FixedTimeEquals(SHA256.HashData(Encoding.UTF8.GetBytes(given)), SHA256.HashData(Encoding.UTF8.GetBytes(expected)));

record LoginRequest(string? Password);
record StartRequest(int TaskCount);
record TaskRequest(string? Title);

public partial class Program;
