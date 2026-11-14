using System.Text;

namespace TeacherHelp.Session;

public sealed record TaskItem(int Number, string? Title);

/// <summary>
/// Plik udostępniony przez nauczyciela. TaskNumber == null oznacza materiał ogólny dla całej lekcji.
/// Categories: grupy (A/B/C), które widzą plik; pusta lista = wszyscy uczniowie.
/// Uczeń dostaje pliki zawsze z pustą listą – nie może po niej poznać swojej grupy.
/// </summary>
public sealed record SharedFile(string Id, string Name, long Size, int? TaskNumber, IReadOnlyList<string> Categories)
{
    public SharedFile(string id, string name, long size, int? taskNumber) : this(id, name, size, taskNumber, []) { }
}

public sealed record StudentTaskView(int Number, string? Title, bool Done, IReadOnlyList<SharedFile> Files);

/// <summary>Uczeń bez otwartej przeglądarki (zamknął ją, wznowienie sesji z CSV), do wybrania na ekranie logowania.</summary>
public sealed record StudentChoice(string Id, string Name);

/// <summary>
/// Co widzi uczeń. State: "waiting" (brak sesji), "login" (sesja trwa, uczeń niezalogowany), "active".
/// Disconnected – tylko w stanie "login": uczniowie sesji, za których nikt jeszcze nie wrócił.
/// RosterOnly – nauczyciel wczytał listę klasy: uczeń tylko wybiera siebie z listy, nie wpisuje imienia.
/// </summary>
public sealed record StudentView(
    string State,
    string? Name,
    IReadOnlyList<StudentTaskView> Tasks,
    IReadOnlyList<SharedFile> Files,
    IReadOnlyList<StudentChoice> Disconnected,
    bool RosterOnly = false);

/// <summary>
/// Connected == false: uczeń jest w sesji, ale nie ma otwartej przeglądarki (zamknął ją albo jest z importu CSV).
/// Category: grupa A/B/C albo null (uczeń widzi tylko pliki dla wszystkich).
/// </summary>
public sealed record StudentRow(string Id, string FirstName, string LastName, string Name, bool Connected, IReadOnlyList<int> Done, string? Category = null);

public sealed record TaskStat(int Number, int DoneCount, int Percent);

public sealed record Dashboard(
    long Version,
    bool Active,
    IReadOnlyList<TaskItem> Tasks,
    IReadOnlyList<StudentRow> Students,
    IReadOnlyList<TaskStat> Stats,
    IReadOnlyList<SharedFile> Files,
    bool RosterOnly = false);

/// <summary>RosterOnly: wczytano listę klasy, więc nie można dopisać się ręcznie – tylko wybrać siebie z listy.</summary>
public enum JoinStatus { Ok, NoSession, InvalidName, NameTaken, NotAvailable, RosterOnly }

/// <summary>Wynik wczytania listy klasy: ilu uczniów dopisano, a ilu już było w sesji (dostali tylko kategorię).</summary>
public sealed record RosterResult(int Added, int Matched);

public sealed record JoinResult(JoinStatus Status, string? Token = null);

/// <summary>
/// Stan jednej lekcji, trzymany wyłącznie w pamięci. Wszystkie operacje są thread-safe;
/// po każdej zmianie wywoływane jest zdarzenie <see cref="Changed"/> (poza blokadą).
/// </summary>
public sealed class SessionService
{
    public const int MaxNameLength = 40;
    public const int MaxTitleLength = 100;
    public const int MaxTasks = 200;
    public const int MaxFileNameLength = 120;

    private sealed class Student(string id, string? token, string firstName, string lastName)
    {
        public string Id { get; } = id;
        /// <summary>Null = nikt jeszcze nie wrócił za tego ucznia (np. po imporcie CSV) albo nauczyciel go odłączył.</summary>
        public string? Token { get; set; } = token;
        /// <summary>Otwarte połączenia (karty przeglądarki) ucznia. Puste = uczeń rozłączony, można go wybrać z listy.</summary>
        public HashSet<string> Connections { get; } = [];
        public bool Online => Connections.Count > 0;
        /// <summary>Uczniowie z listy klasy mają całe „Dane ucznia” w FirstName i puste LastName (nie dzielimy napisu).</summary>
        public string FirstName { get; set; } = firstName;
        public string LastName { get; set; } = lastName;
        public string Name => $"{FirstName} {LastName}".Trim();
        public SortedSet<int> Done { get; } = [];
        public string? Category { get; set; }
    }

    /// <summary>Grupy, do których nauczyciel może przypisać uczniów i pliki.</summary>
    public static readonly IReadOnlyList<string> Categories = ["A", "B", "C"];

    private readonly Lock _lock = new();
    private readonly List<TaskItem> _tasks = [];
    // Kolejność wstawiania = kolejność dołączania uczniów (Dictionary jej nie gwarantuje przy usuwaniu).
    private readonly List<Student> _students = [];
    private readonly List<SharedFile> _files = [];
    private bool _active;
    /// <summary>Wczytano listę klasy: uczniowie tylko wybierają siebie z listy (inaczej ktoś mógłby obejść podział na grupy).</summary>
    private bool _rosterOnly;
    private long _version;

    public event Action? Changed;

    public bool Start(int taskCount)
    {
        if (taskCount < 1 || taskCount > MaxTasks) throw new ArgumentOutOfRangeException(nameof(taskCount));
        lock (_lock)
        {
            if (_active) return false;
            _active = true;
            _rosterOnly = false;
            _tasks.Clear();
            _students.Clear();
            _files.Clear();
            for (var i = 1; i <= taskCount; i++) _tasks.Add(new TaskItem(i, null));
            _version++;
        }
        Changed?.Invoke();
        return true;
    }

    public bool End()
    {
        lock (_lock)
        {
            if (!_active) return false;
            _active = false;
            _rosterOnly = false;
            _tasks.Clear();
            _students.Clear();
            _files.Clear();
            _version++;
        }
        Changed?.Invoke();
        return true;
    }

    public TaskItem? AddTask(string? title)
    {
        TaskItem task;
        lock (_lock)
        {
            if (!_active || _tasks.Count >= MaxTasks) return null;
            task = new TaskItem(_tasks.Count + 1, NormalizeTitle(title));
            _tasks.Add(task);
            _version++;
        }
        Changed?.Invoke();
        return task;
    }

    public bool RenameTask(int number, string? title)
    {
        lock (_lock)
        {
            if (!_active || number < 1 || number > _tasks.Count) return false;
            _tasks[number - 1] = _tasks[number - 1] with { Title = NormalizeTitle(title) };
            _version++;
        }
        Changed?.Invoke();
        return true;
    }

    /// <summary>Rejestruje plik (zapisany już przez wywołującego pod <paramref name="id"/>). Null, gdy brak sesji lub zadania.</summary>
    /// <param name="categories">Grupy, które zobaczą plik (A/B/C); puste lub null = wszyscy. Nieznana grupa = null.</param>
    public SharedFile? AddFile(string id, string? name, long size, int? taskNumber, IEnumerable<string?>? categories = null)
    {
        var groups = new SortedSet<string>(StringComparer.Ordinal);
        foreach (var c in categories ?? [])
        {
            if (string.IsNullOrWhiteSpace(c)) continue;
            if (NormalizeCategory(c) is not { } g) return null;
            groups.Add(g);
        }
        // Wszystkie trzy grupy to to samo co „dla wszystkich” – a taki plik zobaczy też uczeń bez grupy.
        if (groups.Count == Categories.Count) groups.Clear();

        SharedFile file;
        lock (_lock)
        {
            if (!_active || taskNumber is < 1 || taskNumber > _tasks.Count) return null;
            file = new SharedFile(id, NormalizeFileName(name), size, taskNumber, groups.ToList());
            _files.Add(file);
            _version++;
        }
        Changed?.Invoke();
        return file;
    }

    public bool RemoveFile(string id)
    {
        lock (_lock)
        {
            if (_files.RemoveAll(f => f.Id == id) == 0) return false;
            _version++;
        }
        Changed?.Invoke();
        return true;
    }

    /// <summary>Plik dla nauczyciela (bez sprawdzania grup).</summary>
    public SharedFile? GetFile(string id)
    {
        lock (_lock) return _active ? _files.FirstOrDefault(f => f.Id == id) : null;
    }

    /// <summary>Plik dla ucznia o danym tokenie – tylko jeśli uczeń jest w sesji i plik jest dla jego grupy.</summary>
    public SharedFile? GetFileForStudent(string id, string? token)
    {
        lock (_lock)
        {
            if (!_active || FindByToken(token) is not { } student) return null;
            return _files.FirstOrDefault(f => f.Id == id && Visible(f, student));
        }
    }

    private static bool Visible(SharedFile file, Student student) =>
        file.Categories.Count == 0 || student.Category is { } c && file.Categories.Contains(c);

    /// <summary>Nauczyciel zmienia grupę ucznia (null = bez grupy). False, gdy nie ma ucznia albo grupa jest nieznana.</summary>
    public bool SetCategory(string id, string? category)
    {
        var normalized = NormalizeCategory(category);
        if (normalized is null && !string.IsNullOrWhiteSpace(category)) return false;
        lock (_lock)
        {
            if (!_active || _students.FirstOrDefault(s => s.Id == id) is not { } student) return false;
            student.Category = normalized;
            _version++;
        }
        Changed?.Invoke();
        return true;
    }

    /// <summary>
    /// Wczytuje listę klasy (CSV: dane ucznia; kategoria). Uczniowie już obecni w sesji dostają kategorię
    /// (dopasowanie po słowach bez względu na kolejność i wielkość liter, więc „Kowalski Jan” = „Jan Kowalski”),
    /// pozostali są dopisani jako rozłączeni – wybiorą siebie z listy. Od tej chwili nie można dopisać się ręcznie.
    /// Null, gdy brak sesji; <see cref="FormatException"/> z opisem dla nauczyciela, gdy plik jest błędny.
    /// </summary>
    public RosterResult? LoadRoster(string csv)
    {
        var roster = ParseRoster(csv);
        int added = 0, matched = 0;
        lock (_lock)
        {
            if (!_active) return null;
            var taken = new HashSet<Student>();
            foreach (var (name, category) in roster)
            {
                var existing = _students.FirstOrDefault(s => !taken.Contains(s) && SameName(s.Name, name));
                if (existing is null)
                {
                    _students.Add(existing = new Student(NewId(), null, name, ""));
                    added++;
                }
                else
                {
                    (existing.FirstName, existing.LastName) = (name, "");
                    matched++;
                }
                existing.Category = category;
                taken.Add(existing);
            }
            _rosterOnly = true;
            _version++;
        }
        Changed?.Invoke();
        return new RosterResult(added, matched);
    }

    private static List<(string Name, string? Category)> ParseRoster(string csv)
    {
        csv = csv.TrimStart('﻿');
        var firstLine = csv.Split('\n', 2)[0];
        var separator = firstLine.Contains(';') ? ';' : firstLine.Contains('\t') ? '\t' : ',';
        var records = ParseCsv(csv, separator).Where(r => r.Any(f => f.Trim().Length > 0)).ToList();
        // Nagłówek („Dane ucznia;Kategoria”) jest opcjonalny: rozpoznajemy go po tym, że w drugiej kolumnie nie ma grupy.
        if (records.Count > 0 && (records[0][0].Trim().Equals("Dane ucznia", StringComparison.OrdinalIgnoreCase)
            || NormalizeCategory(records[0].ElementAtOrDefault(1)) is null && records[0].ElementAtOrDefault(1)?.Trim() is { Length: > 1 }))
            records.RemoveAt(0);
        if (records.Count == 0) throw new FormatException("Lista uczniów jest pusta.");

        var result = new List<(string Name, string? Category)>();
        foreach (var record in records)
        {
            var raw = Unescape(record[0].Trim());
            var name = NormalizeName(raw)
                ?? throw new FormatException(raw.Length == 0
                    ? "Wiersz bez danych ucznia (pierwsza kolumna jest pusta)."
                    : $"„{raw[..Math.Min(raw.Length, 50)]}” – za długie dane ucznia (maksymalnie {MaxNameLength} znaków).");
            var rawCategory = record.ElementAtOrDefault(1)?.Trim() ?? "";
            var category = NormalizeCategory(rawCategory);
            if (category is null && rawCategory.Length > 0)
                throw new FormatException($"„{name}”: nieznana kategoria „{rawCategory}” (dozwolone: {string.Join(", ", Categories)}).");
            if (result.Any(r => SameName(r.Name, name)))
                throw new FormatException($"Uczeń „{name}” występuje na liście więcej niż raz.");
            result.Add((name, category));
        }
        return result;
    }

    /// <summary>Te same słowa bez względu na kolejność i wielkość liter („Kowalski Jan” = „jan kowalski”).</summary>
    private static bool SameName(string a, string b)
    {
        static string Key(string n) => string.Join(' ', n.ToLowerInvariant().Split(' ', StringSplitOptions.RemoveEmptyEntries).Order(StringComparer.Ordinal));
        return Key(a) == Key(b);
    }

    private static string? NormalizeCategory(string? category)
    {
        var c = category?.Trim().ToUpperInvariant();
        return c is not null && Categories.Contains(c) ? c : null;
    }

    /// <summary>
    /// Dołącza ucznia po imieniu i nazwisku (unikalne w sesji, bez rozróżniania wielkości liter).
    /// Jeśli taki uczeń jest w sesji, ale rozłączony (zamknął przeglądarkę, import CSV), uczeń wraca do niego razem z postępem.
    /// </summary>
    public JoinResult Join(string? firstName, string? lastName, string connectionId)
    {
        var first = NormalizeName(firstName);
        var last = NormalizeName(lastName);
        if (first is null || last is null) return new JoinResult(JoinStatus.InvalidName);

        string token;
        lock (_lock)
        {
            if (!_active) return new JoinResult(JoinStatus.NoSession);
            if (_rosterOnly) return new JoinResult(JoinStatus.RosterOnly);
            var name = $"{first} {last}";
            var existing = _students.FirstOrDefault(s => string.Equals(s.Name, name, StringComparison.OrdinalIgnoreCase));
            if (existing is { Online: true }) return new JoinResult(JoinStatus.NameTaken);
            if (existing is null) _students.Add(existing = new Student(NewId(), null, first, last));
            token = TakeOver(existing, connectionId);
            _version++;
        }
        Changed?.Invoke();
        return new JoinResult(JoinStatus.Ok, token);
    }

    /// <summary>
    /// Uczeń wybiera siebie z listy rozłączonych. Dostaje nowy token – stary (np. w zamkniętej przeglądarce) przestaje działać.
    /// NotAvailable, gdy uczeń jest połączony albo nie ma go w sesji.
    /// </summary>
    public JoinResult Claim(string? studentId, string connectionId)
    {
        string token;
        lock (_lock)
        {
            if (!_active) return new JoinResult(JoinStatus.NoSession);
            var student = _students.FirstOrDefault(s => s.Id == studentId);
            if (student is not { Online: false }) return new JoinResult(JoinStatus.NotAvailable);
            token = TakeOver(student, connectionId);
            _version++;
        }
        Changed?.Invoke();
        return new JoinResult(JoinStatus.Ok, token);
    }

    /// <summary>
    /// Nauczyciel odłącza ucznia od przeglądarki (np. komputer się zepsuł albo ktoś wybrał złą osobę z listy).
    /// Postęp zostaje, a uczeń pojawia się na liście do wybrania.
    /// </summary>
    public bool DisconnectStudent(string id)
    {
        lock (_lock)
        {
            var student = _students.FirstOrDefault(s => s.Id == id);
            if (student is null || student.Token is null && !student.Online) return false;
            student.Token = null;
            student.Connections.Clear();
            _version++;
        }
        Changed?.Invoke();
        return true;
    }

    /// <summary>
    /// Wiąże połączenie przeglądarki z uczniem o danym tokenie (wołane przy każdym pobraniu widoku,
    /// więc także po odświeżeniu strony i po wznowieniu połączenia).
    /// </summary>
    public void Connect(string connectionId, string? token)
    {
        lock (_lock)
        {
            var student = FindByToken(token);
            if (student is null || !student.Connections.Add(connectionId) || student.Connections.Count > 1) return;
            _version++; // uczeń właśnie wrócił
        }
        Changed?.Invoke();
    }

    /// <summary>Połączenie zamknięte (zamknięta karta, odświeżenie, utrata sieci). Bez połączeń uczeń trafia na listę do wybrania.</summary>
    public void Disconnect(string connectionId)
    {
        lock (_lock)
        {
            var student = _students.FirstOrDefault(s => s.Connections.Remove(connectionId));
            if (student is null || student.Online) return;
            _version++;
        }
        Changed?.Invoke();
    }

    private string TakeOver(Student student, string connectionId)
    {
        foreach (var other in _students) other.Connections.Remove(connectionId);
        student.Token = NewId();
        student.Connections.Clear();
        student.Connections.Add(connectionId);
        return student.Token;
    }

    /// <summary>Przełącza „zrobione” dla zadania. Zwraca false, gdy token lub numer jest nieznany.</summary>
    public bool Toggle(string? token, int number)
    {
        lock (_lock)
        {
            var student = FindByToken(token);
            if (student is null || number < 1 || number > _tasks.Count) return false;
            if (!student.Done.Remove(number)) student.Done.Add(number);
            _version++;
        }
        Changed?.Invoke();
        return true;
    }

    public bool RemoveStudent(string id)
    {
        lock (_lock)
        {
            if (_students.RemoveAll(s => s.Id == id) == 0) return false;
            _version++;
        }
        Changed?.Invoke();
        return true;
    }

    public StudentView GetStudentView(string? token)
    {
        lock (_lock)
        {
            if (!_active) return new StudentView("waiting", null, [], [], []);
            var student = FindByToken(token);
            if (student is null)
            {
                var disconnected = _students.Where(s => !s.Online)
                    .Select(s => new StudentChoice(s.Id, s.Name))
                    .OrderBy(c => c.Name, StringComparer.CurrentCultureIgnoreCase)
                    .ToList();
                return new StudentView("login", null, [], [], disconnected, _rosterOnly);
            }
            // Grup plików nie wysyłamy – uczeń nie powinien po nich poznać swojej grupy.
            var files = _files.Where(f => Visible(f, student)).Select(f => f with { Categories = [] }).ToList();
            var tasks = _tasks.Select(t => new StudentTaskView(
                t.Number, t.Title, student.Done.Contains(t.Number),
                files.Where(f => f.TaskNumber == t.Number).ToList())).ToList();
            return new StudentView("active", student.Name, tasks, files.Where(f => f.TaskNumber is null).ToList(), [], _rosterOnly);
        }
    }

    public Dashboard GetDashboard()
    {
        lock (_lock)
        {
            var students = _students.Select(s => new StudentRow(s.Id, s.FirstName, s.LastName, s.Name, s.Online, s.Done.ToList(), s.Category)).ToList();
            var stats = _tasks.Select(t =>
            {
                var done = _students.Count(s => s.Done.Contains(t.Number));
                var percent = _students.Count == 0 ? 0 : (int)Math.Round(100.0 * done / _students.Count);
                return new TaskStat(t.Number, done, percent);
            }).ToList();
            return new Dashboard(_version, _active, _tasks.ToList(), students, stats, _files.ToList(), _rosterOnly);
        }
    }

    /// <summary>
    /// CSV dla polskiego Excela: separator „;”, UTF-8 z BOM (dodawanym przy zapisie).
    /// Ten sam plik można potem wczytać przez <see cref="Import"/>, żeby wrócić do sesji.
    /// </summary>
    public string ExportCsv()
    {
        var dashboard = GetDashboard();
        // Kolumna „Kategoria” tylko przy podziale na grupy – stare eksporty i lekcje bez grup wyglądają jak dawniej.
        var withCategory = dashboard.RosterOnly || dashboard.Students.Any(s => s.Category is not null);
        var sb = new StringBuilder();
        sb.Append("Imię;Nazwisko");
        if (withCategory) sb.Append(";Kategoria");
        foreach (var t in dashboard.Tasks)
            sb.Append(';').Append(CsvField(t.Title is null ? $"Zadanie {t.Number}" : $"{t.Number}. {t.Title}"));
        sb.AppendLine();

        foreach (var s in dashboard.Students)
        {
            sb.Append(CsvField(s.FirstName)).Append(';').Append(CsvField(s.LastName));
            if (withCategory) sb.Append(';').Append(s.Category);
            foreach (var t in dashboard.Tasks) sb.Append(';').Append(s.Done.Contains(t.Number) ? "x" : "");
            sb.AppendLine();
        }

        sb.Append("Procent;");
        if (withCategory) sb.Append(';');
        foreach (var st in dashboard.Stats) sb.Append(';').Append(st.Percent).Append('%');
        sb.AppendLine();
        return sb.ToString();
    }

    /// <summary>
    /// Wznawia sesję z pliku wyeksportowanego przez <see cref="ExportCsv"/> (zadania z tytułami, uczniowie i ich postęp).
    /// Wszyscy uczniowie są rozłączeni – każdy wybiera siebie z listy albo wpisuje to samo imię i nazwisko.
    /// Zwraca false, gdy sesja już trwa; <see cref="FormatException"/> z opisem dla nauczyciela, gdy plik jest błędny.
    /// Pliki dla uczniów nie są w CSV, więc trzeba je udostępnić ponownie.
    /// </summary>
    public bool Import(string csv)
    {
        var (tasks, students, rosterOnly) = ParseImport(csv);
        lock (_lock)
        {
            if (_active) return false;
            _active = true;
            _rosterOnly = rosterOnly;
            _tasks.Clear();
            _tasks.AddRange(tasks);
            _students.Clear();
            _students.AddRange(students);
            _files.Clear();
            _version++;
        }
        Changed?.Invoke();
        return true;
    }

    private static (List<TaskItem> Tasks, List<Student> Students, bool RosterOnly) ParseImport(string csv)
    {
        csv = csv.TrimStart('\uFEFF');
        // Polski Excel zapisuje „;”, ale po zapisaniu w innych ustawieniach regionalnych może być „,” lub tabulator.
        var separator = new[] { ';', ',', '\t' }.FirstOrDefault(c => csv.StartsWith("Imię" + c) || csv.StartsWith("Uczeń" + c));
        if (separator == default)
            throw new FormatException("To nie jest plik wyeksportowany z Teacher Help (pierwsza kolumna powinna nazywać się „Imię”).");

        var records = ParseCsv(csv, separator).Where(r => r.Any(f => f.Trim().Length > 0)).ToList();
        var header = records[0];
        while (header.Count > 0 && header[^1].Trim().Length == 0) header.RemoveAt(header.Count - 1); // Excel dopisuje puste kolumny
        // Starsze eksporty miały jedną kolumnę „Uczeń” zamiast „Imię” i „Nazwisko”.
        var nameColumns = header[0] == "Imię" && header.ElementAtOrDefault(1) == "Nazwisko" ? 2 : header[0] == "Uczeń" ? 1 : 0;
        if (nameColumns == 0)
            throw new FormatException("Brak kolumn „Imię” i „Nazwisko” w pierwszym wierszu.");

        // Eksport lekcji z podziałem na grupy ma po nazwisku kolumnę „Kategoria” – wtedy wraca też tryb listy klasy.
        var withCategory = header.ElementAtOrDefault(nameColumns)?.Trim() == "Kategoria";
        var firstTask = nameColumns + (withCategory ? 1 : 0);
        var taskCount = header.Count - firstTask;
        if (taskCount < 1) throw new FormatException("W pliku nie ma żadnych zadań.");
        if (taskCount > MaxTasks) throw new FormatException($"Za dużo zadań (maksymalnie {MaxTasks}).");
        var tasks = header.Skip(firstTask).Select((h, i) => new TaskItem(i + 1, ParseTaskTitle(h, i + 1))).ToList();

        var students = new List<Student>();
        foreach (var record in records.Skip(1))
        {
            string? first, last;
            if (nameColumns == 2) (first, last) = (record[0].Trim(), record.ElementAtOrDefault(1)?.Trim() ?? "");
            else
            {
                var full = record[0].Trim();
                var space = full.LastIndexOf(' ');
                (first, last) = space < 0 ? (full, "") : (full[..space].Trim(), full[(space + 1)..]);
            }
            if (first == "Procent" && last.Length == 0) continue; // wiersz podsumowania
            first = NormalizeName(Unescape(first));
            last = NormalizeName(Unescape(last)) ?? "";
            if (first is null) throw new FormatException($"Wiersz bez imienia lub z za długim imieniem (maksymalnie {MaxNameLength} znaków).");

            var student = new Student(NewId(), null, first, last);
            if (students.Any(s => string.Equals(s.Name, student.Name, StringComparison.OrdinalIgnoreCase)))
                throw new FormatException($"Uczeń „{student.Name}” występuje w pliku więcej niż raz.");
            if (withCategory)
            {
                var rawCategory = record.ElementAtOrDefault(nameColumns)?.Trim() ?? "";
                student.Category = NormalizeCategory(rawCategory);
                if (student.Category is null && rawCategory.Length > 0)
                    throw new FormatException($"„{student.Name}”: nieznana kategoria „{rawCategory}” (dozwolone: {string.Join(", ", Categories)}).");
            }
            for (var i = 0; i < taskCount; i++)
                if (record.ElementAtOrDefault(firstTask + i)?.Trim() is { Length: > 0 })
                    student.Done.Add(i + 1);
            students.Add(student);
        }
        return (tasks, students, withCategory);
    }

    private static string? ParseTaskTitle(string header, int number)
    {
        var h = Unescape(header.Trim());
        if (h == $"Zadanie {number}") return null;
        var prefix = $"{number}. ";
        return NormalizeTitle(h.StartsWith(prefix) ? h[prefix.Length..] : h);
    }

    /// <summary>Cofa ochronę przed formułami dodaną w <see cref="CsvField"/>.</summary>
    internal static string Unescape(string value) =>
        value.Length > 1 && value[0] == '\'' && "=+-@\t\r".Contains(value[1]) ? value[1..] : value;

    /// <summary>Parser CSV: pola w cudzysłowach mogą zawierać separator, nową linię i podwojony cudzysłów.</summary>
    internal static List<List<string>> ParseCsv(string text, char separator)
    {
        var records = new List<List<string>>();
        var record = new List<string>();
        var field = new StringBuilder();
        var quoted = false;
        for (var i = 0; i < text.Length; i++)
        {
            var c = text[i];
            if (quoted)
            {
                if (c != '"') field.Append(c);
                else if (i + 1 < text.Length && text[i + 1] == '"') { field.Append('"'); i++; }
                else quoted = false;
            }
            else if (c == '"' && field.Length == 0) quoted = true;
            else if (c == separator) { record.Add(field.ToString()); field.Clear(); }
            else if (c is '\r' or '\n')
            {
                if (c == '\r' && i + 1 < text.Length && text[i + 1] == '\n') i++;
                record.Add(field.ToString()); field.Clear();
                records.Add(record); record = [];
            }
            else field.Append(c);
        }
        if (field.Length > 0 || record.Count > 0) { record.Add(field.ToString()); records.Add(record); }
        return records;
    }

    private static string NewId() => Guid.NewGuid().ToString("N");

    private static string? NormalizeName(string? name)
    {
        var n = string.Join(' ', (name ?? "").Split(' ', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries));
        return n.Length is 0 or > MaxNameLength ? null : n;
    }

    private Student? FindByToken(string? token) =>
        string.IsNullOrEmpty(token) ? null : _students.FirstOrDefault(s => s.Token == token);

    private static string? NormalizeTitle(string? title)
    {
        var t = title?.Trim();
        if (string.IsNullOrEmpty(t)) return null;
        return t.Length > MaxTitleLength ? t[..MaxTitleLength] : t;
    }

    private static string NormalizeFileName(string? name)
    {
        // Przeglądarki (stary Edge/IE) potrafią wysłać pełną ścieżkę - zostawiamy samą nazwę.
        var n = (name ?? "").Replace('\\', '/');
        n = n[(n.LastIndexOf('/') + 1)..].Trim();
        n = new string(n.Where(c => !char.IsControl(c)).ToArray());
        if (n.Length == 0) n = "plik";
        return n.Length > MaxFileNameLength ? n[..MaxFileNameLength] : n;
    }

    internal static string CsvField(string value)
    {
        // Ochrona przed wstrzykiwaniem formuł do Excela (imię i nazwisko wpisuje uczeń).
        if (value.Length > 0 && "=+-@\t\r".Contains(value[0])) value = "'" + value;
        return value.IndexOfAny([';', '"', '\n', '\r']) >= 0 ? $"\"{value.Replace("\"", "\"\"")}\"" : value;
    }
}
