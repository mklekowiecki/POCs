using TeacherHelp.Session;

namespace TeacherHelp.Tests;

public class BudgetServiceTests
{
    private static string Game(BudgetService s) => s.GetStudentView("x").GameId!;

    [Fact]
    public void Student_waits_then_joins_and_sees_profile_without_months()
    {
        var s = new BudgetService(new Random(1));
        Assert.Equal("waiting", s.GetStudentView("b1").State);
        Assert.Equal(BudgetJoinStatus.NotRunning, s.Join("b1", null, "Ala"));

        s.Start();
        Assert.Equal("join", s.GetStudentView("b1").State);
        Assert.Equal(BudgetJoinStatus.InvalidName, s.Join("b1", Game(s), "  "));
        Assert.Equal(BudgetJoinStatus.Ok, s.Join("b1", Game(s), " Ala Kot "));

        var view = s.GetStudentView("b1");
        Assert.Equal("playing", view.State);
        Assert.Equal("Ala Kot", view.Name);
        Assert.NotNull(view.Profile);
        Assert.Empty(view.Months);
    }

    [Fact]
    public void Rejoining_from_same_browser_keeps_profile()
    {
        var s = new BudgetService(new Random(2));
        s.Start();
        s.Join("b1", Game(s), "Ala");
        var profile = s.GetStudentView("b1").Profile;
        Assert.Equal(BudgetJoinStatus.Ok, s.Join("b1", Game(s), "Ola"));
        Assert.Equal(profile, s.GetStudentView("b1").Profile);
        Assert.Single(s.GetDashboard().Players);
    }

    [Fact]
    public void First_five_players_get_distinct_incomes_families_and_assets()
    {
        var s = new BudgetService(new Random(3));
        s.Start();
        for (var i = 0; i < 5; i++) s.Join($"b{i}", Game(s), $"Gracz {i}");
        var profiles = s.GetDashboard().Players.Select(p => p.Profile).ToList();
        Assert.Equal([2500, 2800, 3000, 3400, 3800], profiles.Select(p => p.Income).Order());
        Assert.Equal(5, profiles.Select(p => (p.Adults, p.Children)).Distinct().Count());
        Assert.Equal(5, profiles.Select(p => p.Assets).Distinct().Count());
    }

    [Fact]
    public void Teacher_reveals_months_per_player_and_finish_reveals_all()
    {
        var s = new BudgetService(new Random(4));
        s.Start();
        s.Join("b1", Game(s), "Ala");
        s.Join("b2", Game(s), "Ola");
        var ala = s.GetDashboard().Players[0].Id;
        var ola = s.GetDashboard().Players[1].Id;
        Assert.False(s.NextMonth("obcy"));
        Assert.True(s.NextMonth(ala));
        Assert.True(s.NextMonth(ala));
        Assert.Equal([1, 2], s.GetStudentView("b1").Months.Select(m => m.Number));
        Assert.Empty(s.GetStudentView("b2").Months);
        Assert.Equal([2, 0], s.GetDashboard().Players.Select(p => p.Month));

        Assert.True(s.NextMonth(ala));
        Assert.False(s.NextMonth(ala));
        Assert.Equal(3, s.GetStudentView("b1").Month);

        Assert.True(s.Finish());
        Assert.False(s.NextMonth(ola));
        var view = s.GetStudentView("b2");
        Assert.Equal("finished", view.State);
        Assert.Equal([1, 2, 3], view.Months.Select(m => m.Number));
    }

    [Fact]
    public void Follow_up_events_match_earlier_ones_and_profile()
    {
        for (var seed = 0; seed < 200; seed++)
        {
            var s = new BudgetService(new Random(seed));
            s.Start();
            s.Join("b", Game(s), "Ala");
            var p = s.GetDashboard().Players[0];
            var titles = p.Months.Select(m => m.Events.Select(e => e.Title).ToList()).ToList();
            Assert.Equal(titles[0].Contains("Boli Cię ząb"), titles[1].Contains("Darmowy dentysta"));
            Assert.Equal(titles[1].Contains("Kurtki dla dzieci"), titles[2].Contains("Zima idzie"));
            Assert.Equal(p.Profile.Cars > 0, titles[0].Contains("Ubezpieczenie samochodu"));
            Assert.Equal(p.Profile.Cars > 0, titles[2].Contains("Ubezpieczenie samochodu"));
            Assert.Contains("Wyprawka szkolna", titles[0]);
            if (p.Profile.Home != BudgetHome.Block) Assert.DoesNotContain("Malowanie klatki schodowej", titles[1]);
            if (p.Profile.Home != BudgetHome.Village) Assert.DoesNotContain("Niebezpieczny dąb", titles[2]);
            if (p.Profile.Adults < 2) Assert.DoesNotContain("Nowa komoda", titles[1]);
            Assert.True(p.MinBalance <= p.MaxBalance);
        }
    }

    [Fact]
    public void Fixed_costs_follow_scenario_rules()
    {
        var p = new BudgetProfile(3000, 2, 3, BudgetHome.Village, 2, "", "");
        Assert.Equal(5 * 150 + 5 * 200 + 2 * 200, BudgetService.FixedCosts(p));
    }

    [Fact]
    public void Removed_player_joins_again_and_new_game_clears_players()
    {
        var s = new BudgetService(new Random(5));
        s.Start();
        s.Join("b1", Game(s), "Ala");
        Assert.True(s.RemovePlayer(s.GetDashboard().Players[0].Id));
        Assert.Equal("join", s.GetStudentView("b1").State);

        s.Join("b1", Game(s), "Ala");
        var oldGame = Game(s);
        s.Start();
        Assert.Empty(s.GetDashboard().Players);
        Assert.Equal(BudgetJoinStatus.NotRunning, s.Join("b1", oldGame, "Ala"));
    }

    [Fact]
    public void Export_and_import_restore_players_with_profiles_events_and_months()
    {
        var s = new BudgetService(new Random(6));
        s.Start();
        s.Join("b1", Game(s), "Ala; \"Kot\"");
        s.Join("b2", Game(s), "=Ola");
        s.NextMonth(s.GetDashboard().Players[0].Id);
        s.NextMonth(s.GetDashboard().Players[0].Id);
        var before = s.GetDashboard().Players;
        var csv = s.ExportCsv();

        var restored = new BudgetService(new Random(7));
        Assert.True(restored.Import(csv));
        var after = restored.GetDashboard().Players;
        Assert.Equal(BudgetState.Running, restored.GetDashboard().State);
        Assert.Equal(before.Select(p => (p.Name, p.Month, p.Profile, p.FixedCosts, p.MinBalance, p.MaxBalance)),
            after.Select(p => (p.Name, p.Month, p.Profile, p.FixedCosts, p.MinBalance, p.MaxBalance)));
        Assert.Equal(before.SelectMany(p => p.Months.SelectMany(m => m.Events)), after.SelectMany(p => p.Months.SelectMany(m => m.Events)));
        Assert.All(after, p => Assert.False(p.Online));
    }

    [Fact]
    public void Imported_player_is_claimed_from_list_and_teacher_can_disconnect()
    {
        var s = new BudgetService(new Random(8));
        s.Start();
        s.Join("old", Game(s), "Ala");
        var csv = s.ExportCsv();
        s.Finish();
        Assert.True(s.Import(csv));

        var view = s.GetStudentView("new");
        Assert.Equal("join", view.State);
        var ala = Assert.Single(view.Available);
        Assert.Equal("Ala", ala.Name);

        s.Connect("c1", "new");
        Assert.Equal(BudgetJoinStatus.Ok, s.Claim("new", Game(s), ala.Id));
        Assert.Equal("playing", s.GetStudentView("new").State);
        Assert.Empty(s.GetStudentView("other").Available); // ma otwartą stronę
        Assert.Equal(BudgetJoinStatus.NotAvailable, s.Claim("other", Game(s), ala.Id));
        Assert.Equal("join", s.GetStudentView("old").State); // stara przeglądarka już nie gra

        Assert.True(s.DisconnectPlayer(ala.Id));
        Assert.Equal("join", s.GetStudentView("new").State);
        Assert.Single(s.GetStudentView("other").Available);
    }

    [Fact]
    public void Import_is_refused_while_game_runs_and_reports_bad_files()
    {
        var s = new BudgetService(new Random(9));
        s.Start();
        var csv = s.ExportCsv();
        Assert.False(s.Import(csv));
        s.Finish();
        Assert.Throws<FormatException>(() => s.Import("Imię;Nazwisko\nAla;Kot"));
        var bad = csv + "Ala;1;2500;1;1;zamek;wyprawka;;;;;\n";
        Assert.Contains("zamek", Assert.Throws<FormatException>(() => s.Import(bad)).Message);
        var badEvent = csv + "Ala;1;2500;1;1;mieszkanie w bloku;dab;;;;;\n";
        Assert.Contains("dab", Assert.Throws<FormatException>(() => s.Import(badEvent)).Message);
    }
}
