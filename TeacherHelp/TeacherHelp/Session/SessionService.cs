using System.Text;

namespace TeacherHelp.Session;

public sealed record TaskItem(int Number, string? Title);

public sealed record StudentTaskView(int Number, string? Title, bool Done);

/// <summary>Co widzi uczeń. State: "waiting" (brak sesji), "login" (sesja trwa, uczeń niezalogowany), "active".</summary>
public sealed record StudentView(string State, string? Login, IReadOnlyList<StudentTaskView> Tasks);

public sealed record StudentRow(string Id, string Login, IReadOnlyList<int> Done);

public sealed record TaskStat(int Number, int DoneCount, int Percent);

public sealed record Dashboard(
    long Version,
    bool Active,
    IReadOnlyList<TaskItem> Tasks,
    IReadOnlyList<StudentRow> Students,
    IReadOnlyList<TaskStat> Stats);

public enum JoinStatus { Ok, NoSession, InvalidLogin, LoginTaken }

public sealed record JoinResult(JoinStatus Status, string? Token = null);

/// <summary>
/// Stan jednej lekcji, trzymany wyłącznie w pamięci. Wszystkie operacje są thread-safe;
/// po każdej zmianie wywoływane jest zdarzenie <see cref="Changed"/> (poza blokadą).
/// </summary>
public sealed class SessionService
{
    public const int MaxLoginLength = 40;
    public const int MaxTitleLength = 100;
    public const int MaxTasks = 200;

    private sealed class Student(string id, string token, string login)
    {
        public string Id { get; } = id;
        public string Token { get; } = token;
        public string Login { get; } = login;
        public SortedSet<int> Done { get; } = [];
    }

    private readonly Lock _lock = new();
    private readonly List<TaskItem> _tasks = [];
    // Kolejność wstawiania = kolejność dołączania uczniów (Dictionary jej nie gwarantuje przy usuwaniu).
    private readonly List<Student> _students = [];
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

    public JoinResult Join(string? login)
    {
        var normalized = login?.Trim() ?? "";
        if (normalized.Length == 0 || normalized.Length > MaxLoginLength)
            return new JoinResult(JoinStatus.InvalidLogin);

        Student student;
        lock (_lock)
        {
            if (!_active) return new JoinResult(JoinStatus.NoSession);
            if (_students.Any(s => string.Equals(s.Login, normalized, StringComparison.OrdinalIgnoreCase)))
                return new JoinResult(JoinStatus.LoginTaken);
            student = new Student(Guid.NewGuid().ToString("N"), Guid.NewGuid().ToString("N"), normalized);
            _students.Add(student);
            _version++;
        }
        Changed?.Invoke();
        return new JoinResult(JoinStatus.Ok, student.Token);
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
            if (!_active) return new StudentView("waiting", null, []);
            var student = FindByToken(token);
            if (student is null) return new StudentView("login", null, []);
            var tasks = _tasks.Select(t => new StudentTaskView(t.Number, t.Title, student.Done.Contains(t.Number))).ToList();
            return new StudentView("active", student.Login, tasks);
        }
    }

    public Dashboard GetDashboard()
    {
        lock (_lock)
        {
            var students = _students.Select(s => new StudentRow(s.Id, s.Login, s.Done.ToList())).ToList();
            var stats = _tasks.Select(t =>
            {
                var done = _students.Count(s => s.Done.Contains(t.Number));
                var percent = _students.Count == 0 ? 0 : (int)Math.Round(100.0 * done / _students.Count);
                return new TaskStat(t.Number, done, percent);
            }).ToList();
            return new Dashboard(_version, _active, _tasks.ToList(), students, stats);
        }
    }

    /// <summary>CSV dla polskiego Excela: separator „;”, UTF-8 z BOM (dodawanym przy zapisie).</summary>
    public string ExportCsv()
    {
        var dashboard = GetDashboard();
        var sb = new StringBuilder();
        sb.Append("Uczeń");
        foreach (var t in dashboard.Tasks)
            sb.Append(';').Append(CsvField(t.Title is null ? $"Zadanie {t.Number}" : $"{t.Number}. {t.Title}"));
        sb.AppendLine();

        foreach (var s in dashboard.Students)
        {
            sb.Append(CsvField(s.Login));
            foreach (var t in dashboard.Tasks) sb.Append(';').Append(s.Done.Contains(t.Number) ? "x" : "");
            sb.AppendLine();
        }

        sb.Append("Procent");
        foreach (var st in dashboard.Stats) sb.Append(';').Append(st.Percent).Append('%');
        sb.AppendLine();
        return sb.ToString();
    }

    private Student? FindByToken(string? token) =>
        string.IsNullOrEmpty(token) ? null : _students.FirstOrDefault(s => s.Token == token);

    private static string? NormalizeTitle(string? title)
    {
        var t = title?.Trim();
        if (string.IsNullOrEmpty(t)) return null;
        return t.Length > MaxTitleLength ? t[..MaxTitleLength] : t;
    }

    private static string CsvField(string value)
    {
        // Ochrona przed wstrzykiwaniem formuł do Excela (login wpisuje uczeń).
        if (value.Length > 0 && "=+-@\t\r".Contains(value[0])) value = "'" + value;
        return value.IndexOfAny([';', '"', '\n', '\r']) >= 0 ? $"\"{value.Replace("\"", "\"\"")}\"" : value;
    }
}
