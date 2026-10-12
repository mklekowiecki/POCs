using TeacherHelp.Session;

namespace TeacherHelp.Tests;

public class SessionServiceTests
{
    private static int _connections;
    /// <summary>Nowe połączenie przeglądarki.</summary>
    private static string C() => $"conn-{Interlocked.Increment(ref _connections)}";

    [Fact]
    public void Student_sees_waiting_until_session_starts()
    {
        var s = new SessionService();
        Assert.Equal("waiting", s.GetStudentView(null).State);
        Assert.Equal(JoinStatus.NoSession, s.Join("Ala", "Nowak", C()).Status);

        s.Start(3);
        Assert.Equal("login", s.GetStudentView(null).State);
    }

    [Fact]
    public void Start_creates_numbered_tasks_and_cannot_start_twice()
    {
        var s = new SessionService();
        Assert.True(s.Start(3));
        Assert.False(s.Start(5));
        Assert.Equal([1, 2, 3], s.GetDashboard().Tasks.Select(t => t.Number));
    }

    [Fact]
    public void Full_name_is_unique_case_insensitive_and_trimmed()
    {
        var s = new SessionService();
        s.Start(1);
        Assert.Equal(JoinStatus.Ok, s.Join("  Kuba ", " Nowak  ", C()).Status);
        Assert.Equal(JoinStatus.NameTaken, s.Join("kuba", "NOWAK", C()).Status);
        Assert.Equal(JoinStatus.Ok, s.Join("Kuba", "Kowalski", C()).Status);
        Assert.Equal(JoinStatus.Ok, s.Join("Anna  Maria", "Nowak", C()).Status);
        Assert.Equal(JoinStatus.InvalidName, s.Join("   ", "Nowak", C()).Status);
        Assert.Equal(JoinStatus.InvalidName, s.Join("Kuba", "", C()).Status);
        Assert.Equal(JoinStatus.InvalidName, s.Join(new string('a', 41), "Nowak", C()).Status);

        var students = s.GetDashboard().Students;
        Assert.Equal(["Kuba Nowak", "Kuba Kowalski", "Anna Maria Nowak"], students.Select(st => st.Name));
        Assert.Equal(("Kuba", "Nowak"), (students[0].FirstName, students[0].LastName));
        Assert.All(students, st => Assert.True(st.Connected));
    }

    [Fact]
    public void Toggle_marks_and_unmarks_in_any_order()
    {
        var s = new SessionService();
        s.Start(5);
        var token = s.Join("Ala", "Nowak", C()).Token;

        Assert.True(s.Toggle(token, 4));
        Assert.True(s.Toggle(token, 2));
        Assert.Equal([2, 4], s.GetStudentView(token).Tasks.Where(t => t.Done).Select(t => t.Number));

        Assert.True(s.Toggle(token, 4));
        Assert.Equal([2], s.GetStudentView(token).Tasks.Where(t => t.Done).Select(t => t.Number));

        Assert.False(s.Toggle(token, 6));
        Assert.False(s.Toggle("unknown", 1));
    }

    [Fact]
    public void Percent_is_relative_to_logged_in_students()
    {
        var s = new SessionService();
        s.Start(2);
        var a = s.Join("A", "Nowak", C()).Token;
        s.Join("B", "Nowak", C());
        var c = s.Join("C", "Nowak", C()).Token;
        s.Toggle(a, 1);
        s.Toggle(c, 1);

        var stats = s.GetDashboard().Stats;
        Assert.Equal(67, stats[0].Percent);
        Assert.Equal(2, stats[0].DoneCount);
        Assert.Equal(0, stats[1].Percent);
    }

    [Fact]
    public void Percent_is_zero_without_students()
    {
        var s = new SessionService();
        s.Start(1);
        Assert.Equal(0, s.GetDashboard().Stats.Single().Percent);
    }

    [Fact]
    public void Removing_student_invalidates_token_and_frees_login()
    {
        var s = new SessionService();
        s.Start(1);
        var token = s.Join("Kupa", "Nowak", C()).Token;
        var id = s.GetDashboard().Students.Single().Id;

        Assert.True(s.RemoveStudent(id));
        Assert.Equal("login", s.GetStudentView(token).State);
        Assert.Empty(s.GetDashboard().Students);
        Assert.Equal(JoinStatus.Ok, s.Join("Kupa", "Nowak", C()).Status);
    }

    [Fact]
    public void Tasks_can_be_added_and_renamed_during_session()
    {
        var s = new SessionService();
        s.Start(2);
        var added = s.AddTask("  Bonus  ");
        Assert.Equal(new TaskItem(3, "Bonus"), added);

        Assert.True(s.RenameTask(1, "Wstęp"));
        Assert.True(s.RenameTask(3, "   "));
        Assert.False(s.RenameTask(4, "x"));
        Assert.Equal(["Wstęp", null, null], s.GetDashboard().Tasks.Select(t => t.Title));
    }

    [Fact]
    public void End_clears_everything()
    {
        var s = new SessionService();
        s.Start(2);
        var token = s.Join("Ala", "Nowak", C()).Token;
        Assert.True(s.End());

        Assert.Equal("waiting", s.GetStudentView(token).State);
        var d = s.GetDashboard();
        Assert.False(d.Active);
        Assert.Empty(d.Tasks);
        Assert.Empty(d.Students);
        Assert.Null(s.AddTask("x"));
    }

    [Fact]
    public void Version_increases_and_changed_fires_on_every_mutation()
    {
        var s = new SessionService();
        var fired = 0;
        s.Changed += () => fired++;

        s.Start(1);
        var v1 = s.GetDashboard().Version;
        var token = s.Join("Ala", "Nowak", C()).Token;
        s.Toggle(token, 1);

        Assert.Equal(3, fired);
        Assert.True(s.GetDashboard().Version > v1);
    }

    [Fact]
    public void Csv_has_header_rows_percent_and_escapes_formulas()
    {
        var s = new SessionService();
        s.Start(2);
        s.RenameTask(2, "Pętle; for");
        var token = s.Join("=HYPERLINK()", "Nowak", C()).Token;
        s.Toggle(token, 1);

        var lines = s.ExportCsv().TrimEnd().Split(Environment.NewLine);
        Assert.Equal("Imię;Nazwisko;Zadanie 1;\"2. Pętle; for\"", lines[0]);
        Assert.Equal("'=HYPERLINK();Nowak;x;", lines[1]);
        Assert.Equal("Procent;;100%;0%", lines[2]);
    }

    [Fact]
    public void Files_are_split_into_general_and_per_task_for_students()
    {
        var s = new SessionService();
        s.Start(2);
        var token = s.Join("Ala", "Nowak", C()).Token;

        Assert.NotNull(s.AddFile("g", "plan.pdf", 10, null));
        Assert.NotNull(s.AddFile("t2", "dane.csv", 20, 2));
        Assert.Null(s.AddFile("t3", "x.txt", 1, 3));

        var view = s.GetStudentView(token);
        Assert.Equal(["plan.pdf"], view.Files.Select(f => f.Name));
        Assert.Empty(view.Tasks[0].Files);
        Assert.Equal(["dane.csv"], view.Tasks[1].Files.Select(f => f.Name));
        Assert.Equal(2, s.GetDashboard().Files.Count);
    }

    [Fact]
    public void File_name_is_stripped_of_path_and_control_chars()
    {
        var s = new SessionService();
        s.Start(1);
        Assert.Equal("zad1.py", s.AddFile("a", @"C:\Users\nauczyciel\zad1.py", 1, null)!.Name);
        Assert.Equal("a.txt", s.AddFile("b", "../../a\u0007.txt", 1, null)!.Name);
        Assert.Equal("plik", s.AddFile("c", "  ", 1, null)!.Name);
    }

    [Fact]
    public void Files_can_be_removed_and_disappear_when_session_ends()
    {
        var s = new SessionService();
        Assert.Null(s.AddFile("a", "x", 1, null));
        s.Start(1);
        s.AddFile("a", "a.txt", 1, null);
        s.AddFile("b", "b.txt", 1, 1);

        Assert.True(s.RemoveFile("a"));
        Assert.False(s.RemoveFile("a"));
        Assert.Null(s.GetFile("a"));
        Assert.NotNull(s.GetFile("b"));

        s.End();
        Assert.Null(s.GetFile("b"));
        s.Start(1);
        Assert.Empty(s.GetDashboard().Files);
    }

    [Fact]
    public void Import_restores_exported_session_with_all_students_disconnected()
    {
        var source = new SessionService();
        source.Start(3);
        source.RenameTask(2, "Pętle; \"for\"");
        var ala = source.Join("Ala", "Nowak", C()).Token;
        var hacker = source.Join("=1+1", "-Kowalski", C()).Token;
        source.Toggle(ala, 1);
        source.Toggle(ala, 3);
        source.Toggle(hacker, 2);
        var csv = source.ExportCsv();

        var s = new SessionService();
        Assert.True(s.Import(csv));
        Assert.False(s.Import(csv)); // sesja już trwa

        var d = s.GetDashboard();
        Assert.True(d.Active);
        Assert.Equal([null, "Pętle; \"for\"", null], d.Tasks.Select(t => t.Title));
        Assert.Equal(["Ala Nowak", "=1+1 -Kowalski"], d.Students.Select(st => st.Name));
        Assert.Equal([1, 3], d.Students[0].Done);
        Assert.Equal([2], d.Students[1].Done);
        Assert.All(d.Students, st => Assert.False(st.Connected));
        Assert.Equal(source.ExportCsv(), s.ExportCsv());
    }

    [Fact]
    public void Student_returns_to_imported_session_by_picking_themselves_or_typing_name()
    {
        var s = new SessionService();
        s.Import("Imię;Nazwisko;Zadanie 1\nAla;Nowak;x\nOla;Kot;\nProcent;;50%\n");

        var view = s.GetStudentView(null);
        Assert.Equal("login", view.State);
        Assert.Equal(["Ala Nowak", "Ola Kot"], view.Disconnected.Select(c => c.Name));

        var ala = s.Claim(view.Disconnected[0].Id, C());
        Assert.Equal(JoinStatus.Ok, ala.Status);
        Assert.Equal(JoinStatus.NotAvailable, s.Claim(view.Disconnected[0].Id, C()).Status);
        Assert.Equal(JoinStatus.NotAvailable, s.Claim("nieznany", C()).Status);
        Assert.Equal("Ala Nowak", s.GetStudentView(ala.Token).Name);
        Assert.True(s.GetStudentView(ala.Token).Tasks.Single().Done);
        Assert.Equal(["Ola Kot"], s.GetStudentView(null).Disconnected.Select(c => c.Name));

        // Wpisanie tego samego imienia i nazwiska też łączy z zapisanym uczniem (zamiast tworzyć nowego).
        Assert.Equal(JoinStatus.NameTaken, s.Join("ala", "nowak", C()).Status);
        Assert.Equal(JoinStatus.Ok, s.Join("ola", "kot", C()).Status);
        Assert.Equal(2, s.GetDashboard().Students.Count);
        Assert.Empty(s.GetStudentView(null).Disconnected);
    }

    [Fact]
    public void New_student_can_join_imported_session()
    {
        var s = new SessionService();
        s.Import("Imię;Nazwisko;Zadanie 1;Zadanie 2\nAla;Nowak;x;\n");

        var nowy = s.Join("Jan", "Nowy", C());
        Assert.Equal(JoinStatus.Ok, nowy.Status);
        Assert.Equal("Jan Nowy", s.GetStudentView(nowy.Token).Name);
        Assert.All(s.GetStudentView(nowy.Token).Tasks, t => Assert.False(t.Done));
        Assert.Equal(["Ala Nowak"], s.GetStudentView(null).Disconnected.Select(c => c.Name));
        Assert.Equal(["Ala Nowak", "Jan Nowy"], s.GetDashboard().Students.Select(st => st.Name));
        Assert.Equal(50, s.GetDashboard().Stats[0].Percent);
    }

    [Fact]
    public void Student_who_closed_browser_appears_on_list_and_can_return_with_progress()
    {
        var s = new SessionService();
        s.Start(2);
        var oldTab = C();
        var oldToken = s.Join("Ala", "Nowak", oldTab).Token;
        s.Toggle(oldToken, 1);
        s.Connect(oldTab, oldToken);
        Assert.Empty(s.GetStudentView(null).Disconnected);

        // Odświeżenie strony: nowe połączenie z tym samym tokenem, potem zamknięcie starego – uczeń zostaje połączony.
        var refreshed = C();
        s.Connect(refreshed, oldToken);
        s.Disconnect(oldTab);
        Assert.Empty(s.GetStudentView(null).Disconnected);
        Assert.True(s.GetDashboard().Students.Single().Connected);
        Assert.Equal(JoinStatus.NameTaken, s.Join("Ala", "Nowak", C()).Status);

        // Zamknięcie przeglądarki: uczeń trafia na listę, a nauczyciel widzi go jako niepołączonego.
        s.Disconnect(refreshed);
        var choice = s.GetStudentView(null).Disconnected.Single();
        Assert.Equal("Ala Nowak", choice.Name);
        Assert.False(s.GetDashboard().Students.Single().Connected);

        // Powrót z wyczyszczoną pamięcią przeglądarki: wybór z listy przywraca postęp, stary token przestaje działać.
        var back = s.Claim(choice.Id, C());
        Assert.Equal(JoinStatus.Ok, back.Status);
        Assert.True(s.GetStudentView(back.Token).Tasks[0].Done);
        Assert.Equal("login", s.GetStudentView(oldToken).State);
        Assert.Empty(s.GetStudentView(null).Disconnected);
        Assert.Single(s.GetDashboard().Students);
    }

    [Fact]
    public void Connection_changes_bump_version_only_when_student_goes_online_or_offline()
    {
        var s = new SessionService();
        s.Start(1);
        var tab = C();
        var token = s.Join("Ala", "Nowak", tab).Token;
        var fired = 0;
        s.Changed += () => fired++;

        s.Connect(tab, token);       // już połączony tą kartą
        s.Connect(C(), token);       // druga karta
        s.Connect(C(), "nieznany");  // obcy token
        Assert.Equal(0, fired);

        s.Disconnect(tab);
        Assert.Equal(0, fired);      // została druga karta
    }

    [Fact]
    public void Teacher_can_disconnect_student_who_keeps_progress()
    {
        var s = new SessionService();
        s.Start(2);
        var token = s.Join("Ala", "Nowak", C()).Token;
        s.Toggle(token, 2);
        var id = s.GetDashboard().Students.Single().Id;

        Assert.True(s.DisconnectStudent(id));
        Assert.False(s.DisconnectStudent(id));
        Assert.Equal("login", s.GetStudentView(token).State);
        Assert.False(s.GetDashboard().Students.Single().Connected);

        var back = s.Claim(s.GetStudentView(null).Disconnected.Single().Id, C()).Token;
        Assert.Equal([false, true], s.GetStudentView(back).Tasks.Select(t => t.Done));
    }

    [Fact]
    public void Import_accepts_old_single_column_format_and_comma_separator()
    {
        var s = new SessionService();
        Assert.True(s.Import("\uFEFFUczeń,Zadanie 1,2. Wstęp\r\nJan Maria Kowalski,,x\r\nProcent,0%,100%\r\n"));
        var student = s.GetDashboard().Students.Single();
        Assert.Equal(("Jan Maria", "Kowalski"), (student.FirstName, student.LastName));
        Assert.Equal([2], student.Done);
        Assert.Equal([null, "Wstęp"], s.GetDashboard().Tasks.Select(t => t.Title));
    }

    [Theory]
    [InlineData("coś zupełnie innego")]
    [InlineData("Imię;Nazwisko\nAla;Nowak\n")]
    [InlineData("Imię;Nazwisko;Zadanie 1\nAla;Nowak;x\nala;NOWAK;\n")]
    [InlineData("Imię;Nazwisko;Zadanie 1\n;Nowak;x\n")]
    public void Import_rejects_invalid_files_without_starting_session(string csv)
    {
        var s = new SessionService();
        Assert.Throws<FormatException>(() => s.Import(csv));
        Assert.False(s.GetDashboard().Active);
    }
}
