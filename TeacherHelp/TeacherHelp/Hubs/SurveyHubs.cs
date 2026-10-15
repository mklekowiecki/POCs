using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using TeacherHelp.Session;

namespace TeacherHelp.Hubs;

/// <summary>
/// Hub ucznia na stronie ankiety. Przeglądarka przedstawia się losowym identyfikatorem z localStorage
/// (jedna odpowiedź na przeglądarkę). Po każdej zmianie serwer wysyła "changed", a klient pobiera widok przez GetView.
/// </summary>
public sealed class SurveyStudentHub(SurveyService survey) : Hub
{
    public SurveyStudentView GetView(string? browserId)
    {
        survey.Connect(Context.ConnectionId, browserId);
        return survey.GetStudentView(browserId);
    }

    public SubmitStatus Submit(string? browserId, string? surveyId, string? name, int[]? ratings, string? comment) =>
        survey.Submit(browserId, surveyId, name, ratings, comment);

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        survey.Disconnect(Context.ConnectionId);
        return base.OnDisconnectedAsync(exception);
    }
}

/// <summary>Hub nauczyciela ankiety: tylko odczyt. Zmiany idą przez endpointy /api/teacher/survey/*.</summary>
[Authorize]
public sealed class SurveyTeacherHub(SurveyService survey) : Hub
{
    public SurveyDashboard GetDashboard() => survey.GetDashboard();
}

/// <summary>Rozsyła zmiany ankiety do nauczycieli (pełny widok) i uczniów (sygnał "changed").</summary>
public sealed class SurveyNotifier(
    SurveyService survey,
    IHubContext<SurveyTeacherHub> teachers,
    IHubContext<SurveyStudentHub> students,
    ILogger<SurveyNotifier> logger) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken)
    {
        survey.Changed += OnChanged;
        survey.PagesChanged += OnPagesChanged;
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        survey.Changed -= OnChanged;
        survey.PagesChanged -= OnPagesChanged;
        return Task.CompletedTask;
    }

    private void OnChanged() => _ = NotifyAsync(notifyStudents: true);

    // Otwarcie/zamknięcie strony ucznia nie zmienia widoku innych uczniów – nie budzimy całej klasy.
    private void OnPagesChanged() => _ = NotifyAsync(notifyStudents: false);

    private async Task NotifyAsync(bool notifyStudents)
    {
        try
        {
            // Klient nauczyciela odrzuca starsze wiadomości po Version.
            await teachers.Clients.All.SendAsync("dashboard", survey.GetDashboard());
            if (notifyStudents) await students.Clients.All.SendAsync("changed");
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Nie udało się rozesłać zmiany ankiety");
        }
    }
}
