using System.Text;

namespace TeacherHelp.Session;

public sealed record TaskItem(int Number, string? Title);

/// <summary>Plik udostępniony przez nauczyciela. TaskNumber == null oznacza materiał ogólny dla całej lekcji.</summary>
public sealed record SharedFile(string Id, string Name, long Size, int? TaskNumber);

public sealed record StudentTaskView(int Number, string? Title, bool Done, IReadOnlyList<SharedFile> Files);

/// <summary>Uczeń bez przypisanej przeglądarki (np. po wznowieniu sesji z CSV), do wybrania na ekranie logowania.</summary>
public sealed record StudentChoice(string Id, string Name);

/// <summary>
/// Co widzi uczeń. State: "waiting" (brak sesji), "login" (sesja trwa, uczeń niezalogowany), "active".
/// Disconnected – tylko w stanie "login": uczniowie sesji, za których nikt jeszcze nie wrócił.
/// </summary>
public sealed record StudentView(
    string State,
    string? Name,
    IReadOnlyList<StudentTaskView> Tasks,
    IReadOnlyList<SharedFile> Files,
    IReadOnlyList<StudentChoice> Disconnected);

/// <summary>Connected == false: uczeń jest w sesji (np. z importu CSV), ale żadna przeglądarka go jeszcze nie wybrała.</summary>
public sealed record StudentRow(string Id, string FirstName, string LastName, string Name, bool Connected, IReadOnlyList<int> Done);

public sealed record TaskStat(int Number, int DoneCount, int Percent);

public sealed record Dashboard(
    long Version,
    bool Active,
    IReadOnlyList<TaskItem> Tasks,
    IReadOnlyList<StudentRow> Students,
    IReadOnlyList<TaskStat> Stats,
    IReadOnlyList<SharedFile> Files);

public enum JoinStatus { Ok, NoSession, InvalidName, NameTaken, NotAvailable }

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
        /// <summary>Null = uczeń rozłączony: czeka, aż ktoś wybierze go z listy na ekranie logowania.</summary>
        public string? Token { get; set; } = token;
        public string FirstName { get; } = firstName;
        public string LastName { get; } = lastName;
        public string Name => $"{FirstName} {LastName}".Trim();
        public SortedSet<int> Done { get; } = [];
    }

    private readonly Lock _lock = new();
    private readonly List<TaskItem> _tasks = [];
    // Kolejność wstawiania = kolejność dołączania uczniów (Dictionary jej nie gwarantuje przy usuwaniu).
    private readonly List<Student> _students = [];
    private readonly List<SharedFile> _files = [];
    private bool _active;
    private long _version;

    public event Action? Changed;

    public bool Start(int taskCount)
    {
        if (taskCount < 1 || taskCount > MaxTasks) throw new ArgumentOutOfRangeException(nameof(taskCount));
        lock (_lock)
        {
            if (_active) return false;
            _active = true;
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
    public SharedFile? AddFile(string id, string? name, long size, int? taskNumber)
    {
        SharedFile file;
        lock (_lock)
        {
            if (!_active || taskNumber is < 1 || taskNumber > _tasks.Count) return null;
            file = new SharedFile(id, NormalizeFileName(name), size, taskNumber);
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

    public SharedFile? GetFile(string id)
    {
        lock (_lock) return _active ? _files.FirstOrDefault(f => f.Id == id) : null;
    }

    /// <summary>
    /// Dołącza ucznia po imieniu i nazwisku (unikalne w sesji, bez rozróżniania wielkości liter).
    /// Jeśli taki uczeń jest w sesji, ale rozłączony (np. po imporcie CSV), uczeń wraca do niego razem z postępem.
    /// </summary>
    public JoinResult Join(string? firstName, string? lastName)
    {
        var first = NormalizeName(firstName);
        var last = NormalizeName(lastName);
        if (first is null || last is null) return new JoinResult(JoinStatus.InvalidName);

        string token;
        lock (_lock)
        {
            if (!_active) return new JoinResult(JoinStatus.NoSession);
            var name = $"{first} {last}";
            var existing = _students.FirstOrDefault(s => string.Equals(s.Name, name, StringComparison.OrdinalIgnoreCase));
            if (existing is { Token: not null }) return new JoinResult(JoinStatus.NameTaken);
            token = NewId();
            if (existing is not null) existing.Token = token;
            else _students.Add(new Student(NewId(), token, first, last));
            _version++;
        }
        Changed?.Invoke();
        return new JoinResult(JoinStatus.Ok, token);
    }

    /// <summary>Uczeń wybiera siebie z listy rozłączonych. NotAvailable, gdy ktoś go już wybrał albo nie ma go w sesji.</summary>
    public JoinResult Claim(string? studentId)
    {
        string token;
        lock (_lock)
        {
            if (!_active) return new JoinResult(JoinStatus.NoSession);
            var student = _students.FirstOrDefault(s => s.Id == studentId);
            if (student is not { Token: null }) return new JoinResult(JoinStatus.NotAvailable);
            token = NewId();
            student.Token = token;
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
            if (student is not { Token: not null }) return false;
            student.Token = null;
            _version++;
        }
        Changed?.Invoke();
        return true;
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
                var disconnected = _students.Where(s => s.Token is null)
                    .Select(s => new StudentChoice(s.Id, s.Name))
                    .OrderBy(c => c.Name, StringComparer.CurrentCultureIgnoreCase)
                    .ToList();
                return new StudentView("login", null, [], [], disconnected);
            }
            var tasks = _tasks.Select(t => new StudentTaskView(
                t.Number, t.Title, student.Done.Contains(t.Number),
                _files.Where(f => f.TaskNumber == t.Number).ToList())).ToList();
            return new StudentView("active", student.Name, tasks, _files.Where(f => f.TaskNumber is null).ToList(), []);
        }
    }

    public Dashboard GetDashboard()
    {
        lock (_lock)
        {
            var students = _students.Select(s => new StudentRow(s.Id, s.FirstName, s.LastName, s.Name, s.Token is not null, s.Done.ToList())).ToList();
            var stats = _tasks.Select(t =>
            {
                var done = _students.Count(s => s.Done.Contains(t.Number));
                var percent = _students.Count == 0 ? 0 : (int)Math.Round(100.0 * done / _students.Count);
                return new TaskStat(t.Number, done, percent);
            }).ToList();
            return new Dashboard(_version, _active, _tasks.ToList(), students, stats, _files.ToList());
        }
    }

    /// <summary>
    /// CSV dla polskiego Excela: separator „;”, UTF-8 z BOM (dodawanym przy zapisie).
    /// Ten sam plik można potem wczytać przez <see cref="Import"/>, żeby wrócić do sesji.
    /// </summary>
    public string ExportCsv()
    {
        var dashboard = GetDashboard();
        var sb = new StringBuilder();
        sb.Append("Imię;Nazwisko");
        foreach (var t in dashboard.Tasks)
            sb.Append(';').Append(CsvField(t.Title is null ? $"Zadanie {t.Number}" : $"{t.Number}. {t.Title}"));
        sb.AppendLine();

        foreach (var s in dashboard.Students)
        {
            sb.Append(CsvField(s.FirstName)).Append(';').Append(CsvField(s.LastName));
            foreach (var t in dashboard.Tasks) sb.Append(';').Append(s.Done.Contains(t.Number) ? "x" : "");
            sb.AppendLine();
        }

        sb.Append("Procent;");
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
        var (tasks, students) = ParseImport(csv);
        lock (_lock)
        {
            if (_active) return false;
            _active = true;
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

    private static (List<TaskItem> Tasks, List<Student> Students) ParseImport(string csv)
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

        var taskCount = header.Count - nameColumns;
        if (taskCount < 1) throw new FormatException("W pliku nie ma żadnych zadań.");
        if (taskCount > MaxTasks) throw new FormatException($"Za dużo zadań (maksymalnie {MaxTasks}).");
        var tasks = header.Skip(nameColumns).Select((h, i) => new TaskItem(i + 1, ParseTaskTitle(h, i + 1))).ToList();

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
            for (var i = 0; i < taskCount; i++)
                if (record.ElementAtOrDefault(nameColumns + i)?.Trim() is { Length: > 0 })
                    student.Done.Add(i + 1);
            students.Add(student);
        }
        return (tasks, students);
    }

    private static string? ParseTaskTitle(string header, int number)
    {
        var h = Unescape(header.Trim());
        if (h == $"Zadanie {number}") return null;
        var prefix = $"{number}. ";
        return NormalizeTitle(h.StartsWith(prefix) ? h[prefix.Length..] : h);
    }

    /// <summary>Cofa ochronę przed formułami dodaną w <see cref="CsvField"/>.</summary>
    private static string Unescape(string value) =>
        value.Length > 1 && value[0] == '\'' && "=+-@\t\r".Contains(value[1]) ? value[1..] : value;

    /// <summary>Parser CSV: pola w cudzysłowach mogą zawierać separator, nową linię i podwojony cudzysłów.</summary>
    private static List<List<string>> ParseCsv(string text, char separator)
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

    private static string CsvField(string value)
    {
        // Ochrona przed wstrzykiwaniem formuł do Excela (imię i nazwisko wpisuje uczeń).
        if (value.Length > 0 && "=+-@\t\r".Contains(value[0])) value = "'" + value;
        return value.IndexOfAny([';', '"', '\n', '\r']) >= 0 ? $"\"{value.Replace("\"", "\"\"")}\"" : value;
    }
}
