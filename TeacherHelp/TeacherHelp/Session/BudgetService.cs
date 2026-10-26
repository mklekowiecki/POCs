using System.Globalization;
using System.Text;

namespace TeacherHelp.Session;

public enum BudgetState { None, Running, Finished }

public enum BudgetHome { Village, Block, Suburb }

/// <summary>Wylosowana sytuacja gracza: dochód, rodzina i majątek (Family/Assets – opis do wyświetlenia).</summary>
public sealed record BudgetProfile(int Income, int Adults, int Children, BudgetHome Home, int Cars, string Family, string Assets)
{
    public int Persons => Adults + Children;
}

/// <summary>Wydarzenie widziane przez ucznia. Choice = uczeń sam decyduje, czy/ile wydaje.</summary>
public sealed record BudgetEventView(string Title, string Text, bool Choice);

public sealed record BudgetMonthView(int Number, string Name, IReadOnlyList<BudgetEventView> Events);

/// <summary>Gracz bez przeglądarki (np. po wznowieniu gry z pliku) – uczeń może go wybrać na ekranie dołączania.</summary>
public sealed record BudgetPlayerChoice(string Id, string Name);

/// <summary>
/// Co widzi uczeń. State: "waiting" (brak gry), "join" (gra trwa, ta przeglądarka jeszcze nie dołączyła),
/// "playing", "finished". Months – tylko miesiące już odsłonięte temu graczowi (po zakończeniu gry – wszystkie).
/// Available – tylko w stanie "join": gracze bez otwartej przeglądarki, za których można wrócić do gry.
/// </summary>
public sealed record BudgetStudentView(
    string State,
    string? GameId,
    string? Name,
    BudgetProfile? Profile,
    int FixedCosts,
    int Month,
    IReadOnlyList<BudgetMonthView> Months,
    IReadOnlyList<BudgetPlayerChoice> Available);

/// <summary>Wydarzenie w widoku nauczyciela: Cost – koszt policzony dla tego gracza (klucz do sprawdzania arkusza).</summary>
public sealed record BudgetTeacherEvent(string Title, string Cost, bool Choice);

public sealed record BudgetTeacherMonth(int Number, string Name, IReadOnlyList<BudgetTeacherEvent> Events);

/// <summary>
/// Gracz w widoku nauczyciela. Month – ostatni odsłonięty graczowi miesiąc (0 = jeszcze nie zaczął).
/// Months – wszystkie trzy miesiące (nauczyciel widzi też przyszłe).
/// MinBalance/MaxBalance – saldo po 3 miesiącach przy najdroższych / najtańszych decyzjach.
/// </summary>
public sealed record BudgetPlayerRow(
    string Id,
    string Name,
    bool Online,
    int Month,
    BudgetProfile Profile,
    int FixedCosts,
    IReadOnlyList<BudgetTeacherMonth> Months,
    int MinBalance,
    int MaxBalance);

public sealed record BudgetDashboard(long Version, BudgetState State, IReadOnlyList<BudgetPlayerRow> Players);

public enum BudgetJoinStatus { Ok, NotRunning, InvalidName, InvalidBrowser, NotAvailable }

/// <summary>
/// Gra „Budżet domowy” (scenariusz harcerskiego tutoringu): uczeń dołącza i losuje dochód, rodzinę i majątek,
/// a nauczyciel odsłania mu kolejne miesiące z wydarzeniami wylosowanymi osobno dla niego – każdemu graczowi osobno,
/// gdy ten skończy poprzedni miesiąc, więc szybsi nie czekają na resztę klasy.
/// Obliczenia uczniowie robią sami w arkuszu – aplikacja niczego za nich nie liczy, tylko nauczyciel widzi klucz.
/// Stan tylko w pamięci, thread-safe; po każdej zmianie wywoływane jest zdarzenie <see cref="Changed"/> (poza blokadą).
/// </summary>
public sealed class BudgetService(Random? random = null)
{
    public const int Months = 3;
    public const int MaxNameLength = 60;
    public const int BillsPerPerson = 150;
    public const int FoodPerPerson = 200;
    public const int FuelPerCar = 200;

    public static readonly string[] MonthNames = ["", "wrzesień", "październik", "listopad"];

    private static readonly int[] Incomes = [2500, 2800, 3000, 3400, 3800];

    private static readonly (int Adults, int Children)[] Families = [(1, 1), (1, 2), (2, 3), (2, 1), (2, 2)];

    private static readonly (BudgetHome Home, int Cars, string Text)[] Assets =
    [
        (BudgetHome.Village, 2, "dom na wsi i dwa samochody"),
        (BudgetHome.Block, 1, "mieszkanie w bloku i samochód"),
        (BudgetHome.Block, 0, "mieszkanie w bloku"),
        (BudgetHome.Suburb, 0, "dom pod miastem"),
        (BudgetHome.Suburb, 1, "dom pod miastem i samochód"),
    ];

    /// <summary>
    /// Always – zawsze, gdy pasuje do gracza; After – ciąg dalszy, pojawia się zawsze, gdy gracz wylosował wydarzenie After;
    /// pozostałe są losowane. Range to wkład w zakres salda końcowego (min, max wydatek). Dla ciągów dalszych to różnica
    /// względem wydarzenia głównego, tak żeby suma dawała łączny koszt obu (np. ząb: 200 od razu albo 0 + 250 później).
    /// </summary>
    private sealed record EventDef(
        string Id,
        int Month,
        string Title,
        string Text,
        Func<BudgetProfile, bool> Applies,
        Func<BudgetProfile, string> Cost,
        Func<BudgetProfile, (int Min, int Max)> Range,
        bool Choice = false,
        bool Always = false,
        string? After = null);

    private static readonly Func<BudgetProfile, bool> Anyone = _ => true;
    private static readonly Func<BudgetProfile, bool> HasChildren = p => p.Children > 0;
    private static (int, int) Fixed(int cost) => (cost, cost);
    private static string Zl(int amount) => amount.ToString("#,0", CultureInfo.InvariantCulture).Replace(",", " ") + " zł";
    private static int TripPrice(BudgetProfile p) => p.Children > 2 ? 150 : 250;

    private static readonly EventDef[] Events =
    [
        // Miesiąc 1
        new("wyprawka", 1, "Wyprawka szkolna",
            "Zbliża się rok szkolny – Twoje dzieci potrzebują wyprawki. Tego wydatku nie możesz pominąć: edukacja Twoich pociech jest dla Ciebie bardzo ważna. Każda wyprawka kosztuje 300 zł.",
            HasChildren, p => $"{p.Children} × 300 zł = {Zl(p.Children * 300)}", p => Fixed(p.Children * 300), Always: true),
        new("zab", 1, "Boli Cię ząb",
            "Czasem przestaje, ale ból jest coraz silniejszy. Możesz poczekać do następnego miesiąca i pójść do darmowego stomatologa albo zapłacić 200 zł i naprawić ząb od ręki.",
            Anyone, _ => "0 zł (czeka) albo 200 zł", _ => (0, 200), Choice: true),
        new("ubezpieczenie-plan", 1, "Ubezpieczenie samochodu",
            "Za dwa miesiące kończy się ubezpieczenie wszystkich Twoich samochodów – zaplanuj ten wydatek w budżecie. Ubezpieczenie jednego samochodu kosztuje 700 zł.",
            p => p.Cars > 0, p => $"0 zł teraz, w listopadzie {p.Cars} × 700 zł", _ => Fixed(0), Always: true),
        new("basen", 1, "Nowy basen",
            "Twoje dzieci bardzo chcą pójść na nowy basen otwarty w okolicy. Wejście kosztuje 20 zł za osobę. Jeśli pójdziecie, jednemu z dzieci musisz kupić kostium kąpielowy za 70 zł.",
            HasChildren, p => $"0 zł albo {Zl(p.Children * 20 + 70)}–{Zl(p.Persons * 20 + 70)} (wejścia + kostium)",
            p => (0, p.Persons * 20 + 70), Choice: true),

        // Miesiąc 2
        new("wycieczka", 2, "Wycieczka szkolna",
            "Na wywiadówce dowiadujesz się, że szkoła organizuje wycieczkę dla wszystkich klas – 250 zł za dziecko. Jeśli masz więcej niż dwoje dzieci, dostajesz zniżkę: za każde dziecko płacisz 150 zł.",
            HasChildren, p => $"0 zł albo {p.Children} × {TripPrice(p)} zł = {Zl(p.Children * TripPrice(p))}",
            p => (0, p.Children * TripPrice(p)), Choice: true),
        new("buty", 2, "Jesienne buty",
            "Twoje buty na jesień powoli się rozpadają – potrzebujesz nowych. Kosztują 200 zł.",
            Anyone, _ => "200 zł (albo odłożyć zakup)", _ => (0, 200), Choice: true),
        new("kurtki", 2, "Kurtki dla dzieci",
            "Jest październik, a dzieci wyrosły z kurtek. Każda nowa kurtka kosztuje 150 zł. Pogoda jest jednak dość ciepła i kurtki nie są jeszcze bardzo potrzebne – może wystarczy kupić je w przyszłym miesiącu.",
            HasChildren, p => $"0 zł albo {p.Children} × 150 zł = {Zl(p.Children * 150)}", p => (0, p.Children * 150), Choice: true),
        new("komoda", 2, "Nowa komoda",
            "Twoja żona / Twój mąż twierdzi, że potrzebujecie nowej komody do salonu. Koszt to 400 zł.",
            p => p.Adults >= 2, _ => "0 zł albo 400 zł", _ => (0, 400), Choice: true),
        new("przeziebienie", 2, "Przeziębienie",
            "Pogoda mocno się ochłodziła i Twoje dzieci się przeziębiły. Musisz z nimi pojechać do lekarza i kupić leki – 100 zł za każde dziecko.",
            HasChildren, p => $"{p.Children} × 100 zł = {Zl(p.Children * 100)}", p => Fixed(p.Children * 100)),
        new("klatka", 2, "Malowanie klatki schodowej",
            "Mieszkańcy Twojego bloku ustalili na zebraniu, że trzeba pomalować klatkę schodową. Musisz się dołożyć – 100 zł.",
            p => p.Home == BudgetHome.Block, _ => "100 zł", _ => Fixed(100)),
        new("dentysta", 2, "Darmowy dentysta",
            "Jeśli w zeszłym miesiącu postanowiłeś poczekać na darmowego dentystę – niestety, nie wyszło. Uszkodzenie zęba jest bardzo duże, naprawa kosztuje 250 zł.",
            Anyone, _ => "250 zł, jeśli we wrześniu czekał (inaczej 0 zł)", _ => (200, 50), After: "zab"),

        // Miesiąc 3
        new("ubezpieczenie", 3, "Ubezpieczenie samochodu",
            "Pora zapłacić za ubezpieczenie samochodu. Koszt to 700 zł za każdy samochód.",
            p => p.Cars > 0, p => $"{p.Cars} × 700 zł = {Zl(p.Cars * 700)}", p => Fixed(p.Cars * 700), Always: true),
        new("kurtki-zima", 3, "Zima idzie",
            "Zrobiło się naprawdę zimno. Jeśli w październiku nie kupiłeś dzieciom kurtek – teraz musisz. Każda kurtka kosztuje 150 zł.",
            HasChildren, p => $"{Zl(p.Children * 150)}, jeśli nie kupił w październiku", p => (p.Children * 150, 0), After: "kurtki"),
        new("znicze", 3, "Wszystkich Świętych",
            "Jest listopad – kupujesz znicze na groby bliskich. Koszt to 150 zł.",
            Anyone, _ => "150 zł", _ => Fixed(150)),
        new("urodziny", 3, "Urodziny dziecka",
            "Twoje dziecko ma urodziny – organizujesz przyjęcie. Przygotowania kosztują 350 zł.",
            HasChildren, _ => "350 zł", _ => Fixed(350)),
        new("dab", 3, "Niebezpieczny dąb",
            "Przy Twoim domu na wsi rośnie wielki dąb, który zaczyna być niebezpieczny. Koszty wycinki są po Twojej stronie – 400 zł.",
            p => p.Home == BudgetHome.Village, _ => "400 zł", _ => Fixed(400)),
        new("rura", 3, "Pęknięta rura",
            "W łazience pękła rura. Naprawa kosztuje 250 zł. Możesz też kupić wiadro za 40 zł, ale to może skończyć się większymi zniszczeniami.",
            Anyone, _ => "250 zł albo 40 zł (wiadro)", _ => (40, 250), Choice: true),
        new("plecak", 3, "Zepsuty plecak",
            "Twoje dziecko zepsuło plecak – potrzebuje nowego. Koszt to 100 zł.",
            HasChildren, _ => "100 zł", _ => Fixed(100)),
    ];

    private sealed class Player(string id, string? browserId, string name, BudgetProfile profile, EventDef[][] months)
    {
        public string Id { get; } = id;
        /// <summary>Null – gracz bez przeglądarki (wznowiony z pliku albo odłączony przez nauczyciela).</summary>
        public string? BrowserId { get; set; } = browserId;
        public string Name { get; } = name;
        public BudgetProfile Profile { get; } = profile;
        /// <summary>months[m-1] – wylosowane wydarzenia miesiąca m (losowane od razu przy dołączeniu).</summary>
        public EventDef[][] Months { get; } = months;
        public int Month { get; set; }
    }

    private readonly Random _random = random ?? Random.Shared;
    private readonly Lock _lock = new();
    private readonly List<Player> _players = [];
    // Połączenie SignalR → identyfikator przeglądarki (do kropki „online” w panelu).
    private readonly Dictionary<string, string> _connections = [];
    // „Worki z kartkami”: pierwsi gracze dostają różne wartości, dopiero po wyczerpaniu worek jest uzupełniany.
    private readonly List<int> _incomeBag = [];
    private readonly List<int> _familyBag = [];
    private readonly List<int> _assetBag = [];
    private BudgetState _state;
    private string? _gameId;
    private long _version;

    public event Action? Changed;

    /// <summary>Zmiana samej obecności graczy (otwarte strony) – dotyczy tylko widoku nauczyciela.</summary>
    public event Action? PagesChanged;

    public static int FixedCosts(BudgetProfile p) => p.Persons * (BillsPerPerson + FoodPerPerson) + p.Cars * FuelPerCar;

    /// <summary>Nowa gra – zastępuje poprzednią. Zaczyna od miesiąca 0: uczniowie dołączają i poznają swoją sytuację.</summary>
    public void Start()
    {
        lock (_lock)
        {
            _players.Clear();
            _incomeBag.Clear();
            _familyBag.Clear();
            _assetBag.Clear();
            _state = BudgetState.Running;
            _gameId = Guid.NewGuid().ToString("N");
            _version++;
        }
        Changed?.Invoke();
    }

    /// <summary>Nauczyciel odsłania graczowi kolejny miesiąc. False, gdy gra nie trwa, nie ma gracza albo to już ostatni miesiąc.</summary>
    public bool NextMonth(string playerId)
    {
        lock (_lock)
        {
            if (_state != BudgetState.Running) return false;
            var player = _players.FirstOrDefault(p => p.Id == playerId);
            if (player is null || player.Month >= Months) return false;
            player.Month++;
            _version++;
        }
        Changed?.Invoke();
        return true;
    }

    /// <summary>Koniec gry – uczniowie widzą podsumowanie i wszystkie miesiące, także te, do których nie doszli.</summary>
    public bool Finish()
    {
        lock (_lock)
        {
            if (_state != BudgetState.Running) return false;
            _state = BudgetState.Finished;
            _version++;
        }
        Changed?.Invoke();
        return true;
    }

    /// <summary>Dołączenie do gry: losuje sytuację i wydarzenia. Ponowne dołączenie tej samej przeglądarki nic nie zmienia.</summary>
    public BudgetJoinStatus Join(string? browserId, string? gameId, string? name)
    {
        lock (_lock)
        {
            if (_state != BudgetState.Running || gameId != _gameId) return BudgetJoinStatus.NotRunning;
            if (string.IsNullOrWhiteSpace(browserId)) return BudgetJoinStatus.InvalidBrowser;
            var cleanName = name?.Trim();
            if (string.IsNullOrEmpty(cleanName) || cleanName.Length > MaxNameLength) return BudgetJoinStatus.InvalidName;
            if (FindPlayer(browserId) is not null) return BudgetJoinStatus.Ok;

            var income = Incomes[Draw(_incomeBag, Incomes.Length)];
            var (adults, children) = Families[Draw(_familyBag, Families.Length)];
            var asset = Assets[Draw(_assetBag, Assets.Length)];
            var profile = new BudgetProfile(income, adults, children, asset.Home, asset.Cars, FamilyText(adults, children), asset.Text);
            var months = Enumerable.Range(1, Months).ToArray();
            var drawn = new List<EventDef>();
            foreach (var m in months) drawn.AddRange(DrawMonth(m, profile, drawn));
            _players.Add(new Player(Guid.NewGuid().ToString("N"), browserId, cleanName, profile,
                months.Select(m => drawn.Where(e => e.Month == m).ToArray()).ToArray()));
            _version++;
        }
        Changed?.Invoke();
        return BudgetJoinStatus.Ok;
    }

    /// <summary>
    /// Uczeń wybiera siebie z listy graczy bez przeglądarki (np. po wznowieniu gry z pliku) i wraca do swojej sytuacji.
    /// NotAvailable, gdy ten gracz ma otwartą stronę gdzie indziej albo ta przeglądarka już gra kimś innym.
    /// </summary>
    public BudgetJoinStatus Claim(string? browserId, string? gameId, string? playerId)
    {
        lock (_lock)
        {
            if (_state != BudgetState.Running || gameId != _gameId) return BudgetJoinStatus.NotRunning;
            if (string.IsNullOrWhiteSpace(browserId)) return BudgetJoinStatus.InvalidBrowser;
            var player = _players.FirstOrDefault(p => p.Id == playerId);
            if (player is null || IsOnline(player) || FindPlayer(browserId) is not null) return BudgetJoinStatus.NotAvailable;
            player.BrowserId = browserId;
            _version++;
        }
        Changed?.Invoke();
        return BudgetJoinStatus.Ok;
    }

    /// <summary>
    /// Nauczyciel odłącza gracza od przeglądarki (np. komputer się zepsuł albo ktoś wybrał z listy nie siebie).
    /// Sytuacja i postęp zostają, a gracz pojawia się na liście do wybrania.
    /// </summary>
    public bool DisconnectPlayer(string id)
    {
        lock (_lock)
        {
            var player = _players.FirstOrDefault(p => p.Id == id);
            if (player?.BrowserId is null) return false;
            player.BrowserId = null;
            _version++;
        }
        Changed?.Invoke();
        return true;
    }

    /// <summary>
    /// CSV dla polskiego Excela (separator „;”): wiersz na gracza – sytuacja, odsłonięty miesiąc i identyfikatory
    /// wylosowanych wydarzeń, plus kolumny tylko do wglądu (stałe wydatki, zakres wyniku). Wczytuje go <see cref="Import"/>.
    /// </summary>
    public string ExportCsv()
    {
        var sb = new StringBuilder();
        sb.Append("Gracz;Miesiąc;Dochód;Dorośli;Dzieci;Majątek");
        for (var m = 1; m <= Months; m++) sb.Append(";Wydarzenia – ").Append(MonthNames[m]);
        sb.AppendLine(";Stałe / mies.;Wynik min;Wynik max");
        lock (_lock)
        {
            foreach (var p in _players)
            {
                var (min, max) = BalanceRange(p);
                sb.Append(SessionService.CsvField(p.Name)).Append(';').Append(p.Month)
                    .Append(';').Append(p.Profile.Income).Append(';').Append(p.Profile.Adults).Append(';').Append(p.Profile.Children)
                    .Append(';').Append(SessionService.CsvField(p.Profile.Assets));
                foreach (var events in p.Months) sb.Append(';').Append(string.Join(", ", events.Select(e => e.Id)));
                sb.Append(';').Append(FixedCosts(p.Profile)).Append(';').Append(min).Append(';').Append(max).AppendLine();
            }
        }
        return sb.ToString();
    }

    /// <summary>
    /// Wznawia grę z pliku z <see cref="ExportCsv"/>: gracze z sytuacją, wydarzeniami i odsłoniętym miesiącem.
    /// Wszyscy są bez przeglądarki – każdy wybiera siebie z listy. Zwraca false, gdy gra trwa;
    /// <see cref="FormatException"/> z opisem dla nauczyciela, gdy plik jest błędny.
    /// </summary>
    public bool Import(string csv)
    {
        var players = ParseImport(csv);
        lock (_lock)
        {
            if (_state == BudgetState.Running) return false;
            _players.Clear();
            _players.AddRange(players);
            _incomeBag.Clear();
            _familyBag.Clear();
            _assetBag.Clear();
            _state = BudgetState.Running;
            _gameId = Guid.NewGuid().ToString("N");
            _version++;
        }
        Changed?.Invoke();
        return true;
    }

    private static List<Player> ParseImport(string csv)
    {
        csv = csv.TrimStart('﻿');
        // Jak przy lekcji: po zapisaniu w Excelu z innymi ustawieniami regionalnymi separator bywa inny.
        var separator = new[] { ';', ',', '\t' }.FirstOrDefault(c => csv.StartsWith("Gracz" + c));
        if (separator == default)
            throw new FormatException("To nie jest plik gry „Budżet domowy” (pierwsza kolumna powinna nazywać się „Gracz”).");
        var records = SessionService.ParseCsv(csv, separator).Where(r => r.Any(f => f.Trim().Length > 0)).ToList();
        var header = records[0].Select(h => h.Trim()).ToList();
        int Column(string name) => header.IndexOf(name) is var i and >= 0 ? i : throw new FormatException($"Brak kolumny „{name}”.");
        var (month, income, adults, children, assets) =
            (Column("Miesiąc"), Column("Dochód"), Column("Dorośli"), Column("Dzieci"), Column("Majątek"));
        var eventColumns = Enumerable.Range(1, Months).Select(m => Column($"Wydarzenia – {MonthNames[m]}")).ToArray();

        var players = new List<Player>();
        foreach (var record in records.Skip(1))
        {
            string Field(int i) => SessionService.Unescape(record.ElementAtOrDefault(i)?.Trim() ?? "");
            var name = Field(0);
            if (name.Length is 0 or > MaxNameLength)
                throw new FormatException($"Wiersz bez nazwy gracza albo z za długą nazwą (maksymalnie {MaxNameLength} znaków).");
            int Number(int column, int min, int max) =>
                int.TryParse(Field(column), NumberStyles.Integer, CultureInfo.InvariantCulture, out var n) && n >= min && n <= max
                    ? n : throw new FormatException($"{name}: niepoprawna wartość w kolumnie „{header[column]}”.");
            var asset = Assets.FirstOrDefault(a => string.Equals(a.Text, Field(assets), StringComparison.OrdinalIgnoreCase));
            if (asset.Text is null) throw new FormatException($"{name}: nieznany majątek „{Field(assets)}”.");
            var (a, c) = (Number(adults, 1, 10), Number(children, 0, 10));
            var profile = new BudgetProfile(Number(income, 0, 1_000_000), a, c, asset.Home, asset.Cars, FamilyText(a, c), asset.Text);
            var months = eventColumns.Select((column, i) => Field(column)
                .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
                .Select(id => Events.FirstOrDefault(e => e.Id == id && e.Month == i + 1)
                    ?? throw new FormatException($"{name}: nieznane wydarzenie „{id}” w miesiącu {i + 1}."))
                .ToArray()).ToArray();
            players.Add(new Player(Guid.NewGuid().ToString("N"), null, name, profile, months) { Month = Number(month, 0, Months) });
        }
        return players;
    }

    /// <summary>Usunięcie gracza (np. literówka w imieniu) – uczeń wraca do ekranu dołączania i losuje od nowa.</summary>
    public bool RemovePlayer(string id)
    {
        lock (_lock)
        {
            if (_players.RemoveAll(p => p.Id == id) == 0) return false;
            _version++;
        }
        Changed?.Invoke();
        return true;
    }

    public void Connect(string connectionId, string? browserId)
    {
        lock (_lock)
        {
            if (string.IsNullOrWhiteSpace(browserId)) return;
            if (_connections.TryGetValue(connectionId, out var existing) && existing == browserId) return;
            _connections[connectionId] = browserId;
            _version++;
        }
        PagesChanged?.Invoke();
    }

    public void Disconnect(string connectionId)
    {
        lock (_lock)
        {
            if (!_connections.Remove(connectionId)) return;
            _version++;
        }
        PagesChanged?.Invoke();
    }

    public BudgetStudentView GetStudentView(string? browserId)
    {
        lock (_lock)
        {
            if (_state == BudgetState.None) return new BudgetStudentView("waiting", null, null, null, 0, 0, [], []);
            var player = FindPlayer(browserId);
            if (player is null)
                return _state == BudgetState.Running
                    ? new BudgetStudentView("join", _gameId, null, null, 0, 0, [],
                        _players.Where(p => !IsOnline(p)).Select(p => new BudgetPlayerChoice(p.Id, p.Name)).ToList())
                    : new BudgetStudentView("waiting", _gameId, null, null, 0, 0, [], []);
            var revealed = _state == BudgetState.Finished ? Months : player.Month;
            var months = Enumerable.Range(1, revealed)
                .Select(m => new BudgetMonthView(m, MonthNames[m],
                    player.Months[m - 1].Select(e => new BudgetEventView(e.Title, e.Text, e.Choice)).ToList()))
                .ToList();
            return new BudgetStudentView(_state == BudgetState.Finished ? "finished" : "playing", _gameId, player.Name,
                player.Profile, FixedCosts(player.Profile), revealed, months, []);
        }
    }

    public BudgetDashboard GetDashboard()
    {
        lock (_lock)
        {
            var rows = _players.Select(p =>
            {
                var (min, max) = BalanceRange(p);
                return new BudgetPlayerRow(p.Id, p.Name, IsOnline(p), p.Month, p.Profile, FixedCosts(p.Profile),
                    p.Months.Select((events, i) => new BudgetTeacherMonth(i + 1, MonthNames[i + 1],
                        events.Select(e => new BudgetTeacherEvent(e.Title, e.Cost(p.Profile), e.Choice)).ToList())).ToList(),
                    min, max);
            }).ToList();
            return new BudgetDashboard(_version, _state, rows);
        }
    }

    // Saldo po 3 miesiącach przy najdroższych (Min) i najtańszych (Max) decyzjach.
    private static (int Min, int Max) BalanceRange(Player p)
    {
        var all = p.Months.SelectMany(m => m).ToList();
        var net = Months * (p.Profile.Income - FixedCosts(p.Profile));
        return (net - all.Sum(e => e.Range(p.Profile).Max), net - all.Sum(e => e.Range(p.Profile).Min));
    }

    // Wydarzenia „zawsze” + losowo od połowy do wszystkich pozostałych pasujących + ciągi dalsze wcześniej wylosowanych.
    private List<EventDef> DrawMonth(int month, BudgetProfile profile, List<EventDef> earlier)
    {
        var candidates = Events.Where(e => e.Month == month && e.After is null && e.Applies(profile)).ToList();
        var optional = candidates.Where(e => !e.Always).OrderBy(_ => _random.Next()).ToList();
        var picked = optional.Take(_random.Next((optional.Count + 1) / 2, optional.Count + 1)).ToHashSet();
        return Events.Where(e => e.Month == month && (e.After is null
                ? candidates.Contains(e) && (e.Always || picked.Contains(e))
                : earlier.Any(x => x.Id == e.After) && e.Applies(profile)))
            .ToList();
    }

    private bool IsOnline(Player p) => p.BrowserId is not null && _connections.ContainsValue(p.BrowserId);

    private Player? FindPlayer(string? browserId) =>
        string.IsNullOrWhiteSpace(browserId) ? null : _players.FirstOrDefault(p => p.BrowserId == browserId);

    private int Draw(List<int> bag, int size)
    {
        if (bag.Count == 0) bag.AddRange(Enumerable.Range(0, size));
        var i = _random.Next(bag.Count);
        var value = bag[i];
        bag.RemoveAt(i);
        return value;
    }

    private static string FamilyText(int adults, int children) =>
        (adults == 1 ? "1 osoba dorosła" : $"{adults} osoby dorosłe") + " i " + (children == 1 ? "1 dziecko" : $"{children} dzieci");
}
