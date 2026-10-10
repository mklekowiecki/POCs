using TeacherHelp.Session;

namespace TeacherHelp.Tests;

public class SessionServiceTests
{
    [Fact]
    public void Student_sees_waiting_until_session_starts()
    {
        var s = new SessionService();
        Assert.Equal("waiting", s.GetStudentView(null).State);
        Assert.Equal(JoinStatus.NoSession, s.Join("Ala").Status);

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
    public void Login_is_unique_case_insensitive_and_trimmed()
    {
        var s = new SessionService();
        s.Start(1);
        Assert.Equal(JoinStatus.Ok, s.Join("  Kuba ").Status);
        Assert.Equal(JoinStatus.LoginTaken, s.Join("kuba").Status);
        Assert.Equal(JoinStatus.InvalidLogin, s.Join("   ").Status);
        Assert.Equal(JoinStatus.InvalidLogin, s.Join(new string('a', 41)).Status);
        Assert.Equal("Kuba", s.GetDashboard().Students.Single().Login);
    }

    [Fact]
    public void Toggle_marks_and_unmarks_in_any_order()
    {
        var s = new SessionService();
        s.Start(5);
        var token = s.Join("Ala").Token;

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
        var a = s.Join("A").Token;
        s.Join("B");
        var c = s.Join("C").Token;
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
        var token = s.Join("Kupa").Token;
        var id = s.GetDashboard().Students.Single().Id;

        Assert.True(s.RemoveStudent(id));
        Assert.Equal("login", s.GetStudentView(token).State);
        Assert.Empty(s.GetDashboard().Students);
        Assert.Equal(JoinStatus.Ok, s.Join("Kupa").Status);
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
        var token = s.Join("Ala").Token;
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
        var token = s.Join("Ala").Token;
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
        var token = s.Join("=HYPERLINK()").Token;
        s.Toggle(token, 1);

        var lines = s.ExportCsv().TrimEnd().Split(Environment.NewLine);
        Assert.Equal("Uczeń;Zadanie 1;\"2. Pętle; for\"", lines[0]);
        Assert.Equal("'=HYPERLINK();x;", lines[1]);
        Assert.Equal("Procent;100%;0%", lines[2]);
    }
}
