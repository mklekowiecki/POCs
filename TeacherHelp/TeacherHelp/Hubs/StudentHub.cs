using Microsoft.AspNetCore.SignalR;
using TeacherHelp.Session;

namespace TeacherHelp.Hubs;

/// <summary>
/// Hub ucznia. Uczeń identyfikuje się tokenem otrzymanym przy dołączeniu (trzymanym w localStorage),
/// więc odświeżenie strony nie gubi jego kliknięć. Po każdej zmianie serwer wysyła "changed",
/// a klient pobiera swój aktualny widok przez GetView.
/// </summary>
public sealed class StudentHub(SessionService session) : Hub
{
    public StudentView GetView(string? token)
    {
        session.Connect(Context.ConnectionId, token);
        return session.GetStudentView(token);
    }

    public JoinResult Join(string? firstName, string? lastName) => session.Join(firstName, lastName, Context.ConnectionId);

    /// <summary>Powrót do sesji: uczeń wybiera siebie z listy rozłączonych uczniów.</summary>
    public JoinResult Claim(string? studentId) => session.Claim(studentId, Context.ConnectionId);

    /// <summary>Zamknięta karta: uczeń bez innych otwartych kart pojawia się na liście do wybrania.</summary>
    public override Task OnDisconnectedAsync(Exception? exception)
    {
        session.Disconnect(Context.ConnectionId);
        return base.OnDisconnectedAsync(exception);
    }

    public bool Toggle(string? token, int number) => session.Toggle(token, number);
}
