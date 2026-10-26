using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using TeacherHelp.Session;

namespace TeacherHelp.Hubs;

/// <summary>
/// Hub gracza „Budżetu domowego”. Przeglądarka przedstawia się losowym identyfikatorem z localStorage,
/// więc odświeżenie strony nie gubi wylosowanej sytuacji. Po każdej zmianie serwer wysyła "changed".
/// </summary>
public sealed class BudgetStudentHub(BudgetService budget) : Hub
{
    public BudgetStudentView GetView(string? browserId)
    {
        budget.Connect(Context.ConnectionId, browserId);
        return budget.GetStudentView(browserId);
    }

    public BudgetJoinStatus Join(string? browserId, string? gameId, string? name) => budget.Join(browserId, gameId, name);

    public BudgetJoinStatus Claim(string? browserId, string? gameId, string? playerId) => budget.Claim(browserId, gameId, playerId);

    public override Task OnDisconnectedAsync(Exception? exception)
    {
        budget.Disconnect(Context.ConnectionId);
        return base.OnDisconnectedAsync(exception);
    }
}

/// <summary>Hub nauczyciela gry: tylko odczyt. Zmiany idą przez endpointy /api/teacher/budget/*.</summary>
[Authorize]
public sealed class BudgetTeacherHub(BudgetService budget) : Hub
{
    public BudgetDashboard GetDashboard() => budget.GetDashboard();
}

/// <summary>Rozsyła zmiany gry do nauczycieli (pełny widok) i graczy (sygnał "changed").</summary>
public sealed class BudgetNotifier(
    BudgetService budget,
    IHubContext<BudgetTeacherHub> teachers,
    IHubContext<BudgetStudentHub> students,
    ILogger<BudgetNotifier> logger) : IHostedService
{
    public Task StartAsync(CancellationToken cancellationToken)
    {
        budget.Changed += OnChanged;
        budget.PagesChanged += OnPagesChanged;
        return Task.CompletedTask;
    }

    public Task StopAsync(CancellationToken cancellationToken)
    {
        budget.Changed -= OnChanged;
        budget.PagesChanged -= OnPagesChanged;
        return Task.CompletedTask;
    }

    private void OnChanged() => _ = NotifyAsync(notifyStudents: true);

    private void OnPagesChanged() => _ = NotifyAsync(notifyStudents: false);

    private async Task NotifyAsync(bool notifyStudents)
    {
        try
        {
            await teachers.Clients.All.SendAsync("dashboard", budget.GetDashboard());
            if (notifyStudents) await students.Clients.All.SendAsync("changed");
        }
        catch (Exception ex)
        {
            logger.LogWarning(ex, "Nie udało się rozesłać zmiany gry");
        }
    }
}
