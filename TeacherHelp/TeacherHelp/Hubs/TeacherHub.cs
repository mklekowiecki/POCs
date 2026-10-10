using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.SignalR;
using TeacherHelp.Session;

namespace TeacherHelp.Hubs;

/// <summary>Hub nauczyciela: tylko odczyt. Zmiany idą przez endpointy /api/teacher/*.</summary>
[Authorize]
public sealed class TeacherHub(SessionService session) : Hub
{
    public Dashboard GetDashboard() => session.GetDashboard();
}
