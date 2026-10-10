using Microsoft.AspNetCore.SignalR;
using TeacherHelp.Session;

namespace TeacherHelp.Hubs;

/// <summary>Rozsyła zmiany stanu sesji do nauczycieli (pełny dashboard) i uczniów (sygnał "changed").</summary>
public sealed class SessionNotifier(
    SessionService session,
    IHubContext<TeacherHub> teachers,
    IHubContext<StudentHub> students,
    ILogger<SessionNotifier> logger) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken)
    {
        session.Changed += OnChanged;
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        session.Changed -= OnChanged;
        return Task.CompletedTask;
    }

    private void OnChanged() => _ = NotifyAsync();

    private async Task NotifyAsync()
    {
        try
        {
            // Wiadomości mogą dojść w innej kolejności; klient nauczyciela odrzuca starsze po Version.
            await teachers.Clients.All.SendAsync("dashboard", session.GetDashboard());
            await students.Clients.All.SendAsync("changed");
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Nie udało się rozesłać zmiany sesji");
        }
    }
}
