using TeacherHelp.Session;

namespace TeacherHelp.Tests;

public class SurveyServiceTests
{
    private static string Id(SurveyService s) => s.GetStudentView("x").SurveyId!;

    [Fact]
    public void Student_waits_until_survey_starts_and_sees_questions()
    {
        var s = new SurveyService();
        Assert.Equal("waiting", s.GetStudentView("b1").State);
        Assert.Equal(SubmitStatus.NotOpen, s.Submit("b1", null, null, [3], null));

        Assert.True(s.Start(["  pętla for ", "", null, "tablice"], named: false));
        var view = s.GetStudentView("b1");
        Assert.Equal("open", view.State);
        Assert.False(view.Named);
        Assert.Equal([new SurveyQuestion(1, "pętla for"), new SurveyQuestion(2, "tablice")], view.Questions);
    }

    [Fact]
    public void Start_requires_one_to_max_questions()
    {
        var s = new SurveyService();
        Assert.False(s.Start([], false));
        Assert.False(s.Start(["  ", null], false));
        Assert.False(s.Start(Enumerable.Range(1, SurveyService.MaxQuestions + 1).Select(i => $"q{i}"), false));
        Assert.True(s.Start(Enumerable.Range(1, SurveyService.MaxQuestions).Select(i => $"q{i}"), false));
        Assert.True(s.Start([new string('a', 300)], false));
        Assert.Equal(SurveyService.MaxQuestionLength, s.GetStudentView("b").Questions[0].Text.Length);
    }

    [Fact]
    public void One_response_per_browser()
    {
        var s = new SurveyService();
        s.Start(["q1"], false);
        Assert.Equal(SubmitStatus.Ok, s.Submit("b1", Id(s), null, [4], null));
        Assert.Equal(SubmitStatus.AlreadyVoted, s.Submit("b1", Id(s), null, [1], null));
        Assert.Equal("voted", s.GetStudentView("b1").State);
        Assert.Empty(s.GetStudentView("b1").Questions);
        Assert.Equal("open", s.GetStudentView("b2").State);
        Assert.Equal(SubmitStatus.InvalidAnswers, s.Submit("", Id(s), null, [1], null));
        Assert.Equal(1, s.GetDashboard().ResponseCount);
    }

    [Fact]
    public void Ratings_must_cover_every_question_within_scale()
    {
        var s = new SurveyService();
        s.Start(["q1", "q2"], false);
        Assert.Equal(SubmitStatus.InvalidAnswers, s.Submit("b", Id(s), null, [3], null));
        Assert.Equal(SubmitStatus.InvalidAnswers, s.Submit("b", Id(s), null, [3, 3, 3], null));
        Assert.Equal(SubmitStatus.InvalidAnswers, s.Submit("b", Id(s), null, [0, 3], null));
        Assert.Equal(SubmitStatus.InvalidAnswers, s.Submit("b", Id(s), null, [3, 6], null));
        Assert.Equal(SubmitStatus.InvalidAnswers, s.Submit("b", Id(s), null, null, null));
        Assert.Equal(SubmitStatus.Ok, s.Submit("b", Id(s), null, [1, 5], null));
    }

    [Fact]
    public void Response_to_replaced_survey_is_rejected()
    {
        var s = new SurveyService();
        s.Start(["q1"], false);
        var old = Id(s);
        s.Start(["q1"], false);
        Assert.Equal(SubmitStatus.NotOpen, s.Submit("b", old, null, [3], null));
        Assert.Equal(SubmitStatus.Ok, s.Submit("b", Id(s), null, [3], null));
    }

    [Fact]
    public void Named_survey_requires_name_and_lists_responses()
    {
        var s = new SurveyService();
        s.Start(["q1"], named: true);
        Assert.True(s.GetStudentView("b").Named);
        Assert.Equal(SubmitStatus.InvalidName, s.Submit("b1", Id(s), "  ", [2], null));
        Assert.Equal(SubmitStatus.InvalidName, s.Submit("b1", Id(s), new string('a', 61), [2], null));
        Assert.Equal(SubmitStatus.Ok, s.Submit("b1", Id(s), " Ala Nowak ", [2], " nie wiem, po co break "));

        var d = s.GetDashboard();
        Assert.True(d.Named);
        var row = Assert.Single(d.Responses);
        Assert.Equal("Ala Nowak", row.Name);
        Assert.Equal([2], row.Ratings);
        Assert.Equal("nie wiem, po co break", row.Comment);
    }

    [Fact]
    public void Anonymous_survey_ignores_names_and_hides_rows()
    {
        var s = new SurveyService();
        s.Start(["q1"], named: false);
        Assert.Equal(SubmitStatus.Ok, s.Submit("b1", Id(s), "Ala", [2], "trudne"));
        Assert.Equal(SubmitStatus.Ok, s.Submit("b2", Id(s), null, [4], "   "));

        var d = s.GetDashboard();
        Assert.Empty(d.Responses);
        Assert.Equal(["trudne"], d.Comments);
        Assert.DoesNotContain("Ala", s.ExportCsv());
    }

    [Fact]
    public void Comment_is_trimmed_to_max_length()
    {
        var s = new SurveyService();
        s.Start(["q1"], false);
        s.Submit("b", Id(s), null, [3], new string('x', 900));
        Assert.Equal(SurveyService.MaxCommentLength, s.GetDashboard().Comments[0].Length);
    }

    [Fact]
    public void Dashboard_has_distribution_and_average_per_question()
    {
        var s = new SurveyService();
        s.Start(["q1", "q2"], false);
        Assert.Null(s.GetDashboard().Questions[0].Average);

        s.Submit("b1", Id(s), null, [1, 5], null);
        s.Submit("b2", Id(s), null, [5, 5], null);
        s.Submit("b3", Id(s), null, [5, 4], null);

        var q = s.GetDashboard().Questions;
        Assert.Equal([1, 0, 0, 0, 2], q[0].Counts);
        Assert.Equal(3.67, q[0].Average);
        Assert.Equal([0, 0, 0, 1, 2], q[1].Counts);
        Assert.Equal(4.67, q[1].Average);
        Assert.All(q, x => Assert.Equal(3, x.Responses));
    }

    [Fact]
    public void Open_pages_count_distinct_browsers()
    {
        var s = new SurveyService();
        s.Connect("c1", "b1");
        s.Connect("c2", "b1"); // druga karta tej samej przeglądarki
        s.Connect("c3", "b2");
        s.Connect("c4", null);
        Assert.Equal(2, s.GetDashboard().OpenPages);

        s.Disconnect("c1");
        Assert.Equal(2, s.GetDashboard().OpenPages);
        s.Disconnect("c2");
        Assert.Equal(1, s.GetDashboard().OpenPages);
    }

    [Fact]
    public void Close_stops_responses()
    {
        var s = new SurveyService();
        Assert.False(s.Close());
        s.Start(["q1"], false);
        var id = Id(s);
        s.Submit("b1", id, null, [3], null);
        Assert.True(s.Close());
        Assert.False(s.Close());

        Assert.Equal("closed", s.GetStudentView("b1").State);
        Assert.Equal("closed", s.GetStudentView("b2").State);
        Assert.Equal(SubmitStatus.NotOpen, s.Submit("b2", id, null, [3], null));
        Assert.Equal(SurveyState.Closed, s.GetDashboard().State);
        Assert.Equal(1, s.GetDashboard().ResponseCount);
    }

    [Fact]
    public void New_survey_replaces_previous_results()
    {
        var s = new SurveyService();
        s.Start(["q1"], false);
        s.Submit("b1", Id(s), null, [3], "x");
        s.Close();

        s.Start(["a", "b"], true);
        var d = s.GetDashboard();
        Assert.Equal(SurveyState.Open, d.State);
        Assert.Equal(0, d.ResponseCount);
        Assert.Empty(d.Comments);
        Assert.Equal(2, d.Questions.Count);
        Assert.Equal("open", s.GetStudentView("b1").State);
    }

    [Fact]
    public void Export_marks_results_as_exported_until_next_response()
    {
        var s = new SurveyService();
        Assert.Null(s.ExportCsv());
        s.Start(["q1"], false);
        Assert.False(s.GetDashboard().Exported);
        s.ExportCsv();
        Assert.True(s.GetDashboard().Exported);
        s.Submit("b1", Id(s), null, [3], null);
        Assert.False(s.GetDashboard().Exported);
    }

    [Fact]
    public void Export_csv_has_rows_and_summary()
    {
        var s = new SurveyService();
        s.Start(["pętla for", "=SUMA()"], named: true);
        s.Submit("b1", Id(s), "Ala", [1, 5], "co to; jest?");
        s.Submit("b2", Id(s), "Ola", [4, 5], null);

        var lines = s.ExportCsv()!.Split(Environment.NewLine);
        Assert.Equal("Imię;pętla for;'=SUMA();Komentarz", lines[0]);
        Assert.Equal("Ala;1;5;\"co to; jest?\"", lines[1]);
        Assert.Equal("Ola;4;5;", lines[2]);
        Assert.Equal("", lines[3]);
        Assert.Equal("Średnia;2,50;5,00;", lines[4]);
        Assert.Equal("Ocena 1;1;0;", lines[5]);
        Assert.Equal("Ocena 4;1;0;", lines[8]);
        Assert.Equal("Ocena 5;0;2;", lines[9]);
        Assert.Equal("Odpowiedzi;2", lines[10]);
    }

    [Fact]
    public void Anonymous_export_numbers_rows()
    {
        var s = new SurveyService();
        s.Start(["q1"], named: false);
        s.Submit("b1", Id(s), null, [2], null);
        var lines = s.ExportCsv()!.Split(Environment.NewLine);
        Assert.Equal("Nr;q1;Komentarz", lines[0]);
        Assert.Equal("1;2;", lines[1]);
    }

    [Fact]
    public void Changes_raise_event()
    {
        var s = new SurveyService();
        var (changed, pages) = (0, 0);
        s.Changed += () => changed++;
        s.PagesChanged += () => pages++;
        s.Start(["q1"], false);
        s.Submit("b1", Id(s), null, [3], null);
        s.Connect("c1", "b1");
        s.Connect("c1", "b1"); // bez zmiany
        s.Disconnect("c1");
        s.Disconnect("c1"); // bez zmiany
        s.Close();
        Assert.Equal((3, 2), (changed, pages));
    }
}
