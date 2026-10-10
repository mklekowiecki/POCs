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
    public StudentView GetView(string? token) => session.GetStudentView(token);

    public JoinResult Join(string? login) => session.Join(login);

    public bool Toggle(string? token, int number) => session.Toggle(token, number);
}
