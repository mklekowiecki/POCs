using System.Globalization;
using System.Text;

namespace TeacherHelp.Session;

public enum SurveyState { None, Open, Closed }

public sealed record SurveyQuestion(int Number, string Text);

/// <summary>
/// Co widzi uczeń na stronie ankiety. State: "waiting" (brak ankiety), "open" (może odpowiedzieć),
/// "voted" (ta przeglądarka już odpowiedziała, ankieta trwa), "closed" (ankieta zamknięta).
/// </summary>
public sealed record SurveyStudentView(string State, string? SurveyId, bool Named, IReadOnlyList<SurveyQuestion> Questions);

/// <summary>Counts[i] = liczba ocen i+1. Average == null, gdy nikt jeszcze nie odpowiedział.</summary>
public sealed record SurveyQuestionStat(int Number, string Text, IReadOnlyList<int> Counts, int Responses, double? Average);

/// <summary>Name == null w ankiecie anonimowej.</summary>
public sealed record SurveyResponseRow(string? Name, IReadOnlyList<int> Ratings, string? Comment);

/// <summary>
/// Widok nauczyciela. OpenPages = liczba przeglądarek z otwartą stroną ankiety (mianownik dla Responses).
/// Responses (wiersze z imionami) tylko w trybie imiennym; Comments w obu trybach.
/// Exported = wyniki pobrano jako CSV od ostatniej zmiany (nowa ankieta bez ostrzeżenia).
/// </summary>
public sealed record SurveyDashboard(
    long Version,
    SurveyState State,
    bool Named,
    IReadOnlyList<SurveyQuestionStat> Questions,
    int ResponseCount,
    int OpenPages,
    IReadOnlyList<string> Comments,
    IReadOnlyList<SurveyResponseRow> Responses,
    bool Exported);

public enum SubmitStatus { Ok, NotOpen, AlreadyVoted, InvalidName, InvalidAnswers }

/// <summary>
/// Ankieta „Co kumam”: pytania wpisane przez nauczyciela, oceny 1–5, jedna odpowiedź na przeglądarkę.
/// Niezależna od sesji zadań. Stan tylko w pamięci, thread-safe; po każdej zmianie wywoływane jest
/// zdarzenie <see cref="Changed"/> (poza blokadą).
/// </summary>
public sealed class SurveyService
{
    public const int MaxQuestions = 10;
    public const int MaxQuestionLength = 200;
    public const int MaxNameLength = 60;
    public const int MaxCommentLength = 500;
    public const int MinRating = 1;
    public const int MaxRating = 5;

    private sealed record Response(string BrowserId, string? Name, int[] Ratings, string? Comment);

    private readonly Lock _lock = new();
    private readonly List<SurveyQuestion> _questions = [];
    private readonly List<Response> _responses = [];
    // Połączenie SignalR → identyfikator przeglądarki (kilka kart jednej przeglądarki liczy się raz).
    private readonly Dictionary<string, string> _connections = [];
    private SurveyState _state;
    private string? _surveyId;
    private bool _named;
    private bool _exported;
    private long _version;

    public event Action? Changed;

    /// <summary>Zmiana samej liczby otwartych stron – dotyczy tylko widoku nauczyciela.</summary>
    public event Action? PagesChanged;

    /// <summary>
    /// Nowa ankieta – zastępuje poprzednią (otwartą lub zamkniętą). Puste pytania są pomijane.
    /// Zwraca false, gdy nie ma żadnego pytania albo jest ich za dużo.
    /// </summary>
    public bool Start(IEnumerable<string?>? questions, bool named)
    {
        var texts = (questions ?? []).Select(NormalizeQuestion).OfType<string>().ToList();
        if (texts.Count == 0 || texts.Count > MaxQuestions) return false;
        lock (_lock)
        {
            _questions.Clear();
            _questions.AddRange(texts.Select((t, i) => new SurveyQuestion(i + 1, t)));
            _responses.Clear();
            _named = named;
            _state = SurveyState.Open;
            _surveyId = Guid.NewGuid().ToString("N");
            _exported = false;
            _version++;
        }
        Changed?.Invoke();
        return true;
    }

    public bool Close()
    {
        lock (_lock)
        {
            if (_state != SurveyState.Open) return false;
            _state = SurveyState.Closed;
            _version++;
        }
        Changed?.Invoke();
        return true;
    }

    /// <summary>Strona ankiety otwarta (także po ponownym połączeniu). Pusty browserId nie jest liczony.</summary>
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

    public SurveyStudentView GetStudentView(string? browserId)
    {
        lock (_lock)
        {
            var state = _state switch
            {
                SurveyState.None => "waiting",
                SurveyState.Closed => "closed",
                _ => HasVoted(browserId) ? "voted" : "open",
            };
            return state == "open"
                ? new SurveyStudentView(state, _surveyId, _named, _questions.ToList())
                : new SurveyStudentView(state, _surveyId, _named, []);
        }
    }

    /// <summary>
    /// Odpowiedź ucznia: ocena 1–5 dla każdego pytania (w kolejności), opcjonalny komentarz,
    /// imię wymagane tylko w ankiecie imiennej (w anonimowej jest ignorowane).
    /// surveyId chroni przed odpowiedzią na ankietę, którą nauczyciel w międzyczasie zastąpił nową.
    /// </summary>
    public SubmitStatus Submit(string? browserId, string? surveyId, string? name, IReadOnlyList<int>? ratings, string? comment)
    {
        lock (_lock)
        {
            if (_state != SurveyState.Open || surveyId != _surveyId) return SubmitStatus.NotOpen;
            if (string.IsNullOrWhiteSpace(browserId)) return SubmitStatus.InvalidAnswers;
            if (HasVoted(browserId)) return SubmitStatus.AlreadyVoted;
            if (ratings is null || ratings.Count != _questions.Count || ratings.Any(r => r is < MinRating or > MaxRating))
                return SubmitStatus.InvalidAnswers;
            string? cleanName = null;
            if (_named)
            {
                cleanName = NormalizeText(name);
                if (cleanName is null || cleanName.Length > MaxNameLength) return SubmitStatus.InvalidName;
            }
            var cleanComment = NormalizeText(comment);
            if (cleanComment?.Length > MaxCommentLength) cleanComment = cleanComment[..MaxCommentLength];
            _responses.Add(new Response(browserId, cleanName, ratings.ToArray(), cleanComment));
            _exported = false;
            _version++;
        }
        Changed?.Invoke();
        return SubmitStatus.Ok;
    }

    public SurveyDashboard GetDashboard()
    {
        lock (_lock)
        {
            var stats = _questions.Select((q, i) =>
            {
                var counts = new int[MaxRating - MinRating + 1];
                foreach (var r in _responses) counts[r.Ratings[i] - MinRating]++;
                double? average = _responses.Count == 0 ? null : Math.Round(_responses.Average(r => r.Ratings[i]), 2);
                return new SurveyQuestionStat(q.Number, q.Text, counts, _responses.Count, average);
            }).ToList();
            var rows = _named
                ? _responses.Select(r => new SurveyResponseRow(r.Name, r.Ratings, r.Comment)).ToList()
                : [];
            return new SurveyDashboard(
                _version,
                _state,
                _named,
                stats,
                _responses.Count,
                _connections.Values.Distinct().Count(),
                _responses.Select(r => r.Comment).OfType<string>().ToList(),
                rows,
                _exported);
        }
    }

    /// <summary>
    /// CSV dla polskiego Excela (separator ';', przecinek dziesiętny): wiersz na odpowiedź
    /// (w trybie imiennym z imieniem), potem podsumowanie – średnia i liczba ocen 1–5 dla każdego pytania.
    /// Null, gdy nie ma ankiety. Oznacza wyniki jako wyeksportowane.
    /// </summary>
    public string? ExportCsv()
    {
        string csv;
        lock (_lock)
        {
            if (_state == SurveyState.None) return null;
            var pl = CultureInfo.GetCultureInfo("pl-PL");
            var sb = new StringBuilder();
            sb.Append(_named ? "Imię" : "Nr");
            foreach (var q in _questions) sb.Append(';').Append(SessionService.CsvField(q.Text));
            sb.AppendLine(";Komentarz");

            for (var n = 0; n < _responses.Count; n++)
            {
                var r = _responses[n];
                sb.Append(_named ? SessionService.CsvField(r.Name ?? "") : (n + 1).ToString(CultureInfo.InvariantCulture));
                foreach (var rating in r.Ratings) sb.Append(';').Append(rating);
                sb.Append(';').AppendLine(SessionService.CsvField(r.Comment ?? ""));
            }

            sb.AppendLine();
            sb.Append("Średnia");
            for (var i = 0; i < _questions.Count; i++)
                sb.Append(';').Append(_responses.Count == 0 ? "" : _responses.Average(r => r.Ratings[i]).ToString("0.00", pl));
            sb.AppendLine(";");
            for (var rating = MinRating; rating <= MaxRating; rating++)
            {
                sb.Append("Ocena ").Append(rating);
                for (var i = 0; i < _questions.Count; i++) sb.Append(';').Append(_responses.Count(r => r.Ratings[i] == rating));
                sb.AppendLine(";");
            }
            sb.Append("Odpowiedzi;").Append(_responses.Count).AppendLine();
            csv = sb.ToString();

            if (_exported) return csv;
            _exported = true;
            _version++;
        }
        Changed?.Invoke();
        return csv;
    }

    private bool HasVoted(string? browserId) =>
        !string.IsNullOrWhiteSpace(browserId) && _responses.Any(r => r.BrowserId == browserId);

    private static string? NormalizeQuestion(string? text)
    {
        var t = NormalizeText(text);
        return t?.Length > MaxQuestionLength ? t[..MaxQuestionLength] : t;
    }

    private static string? NormalizeText(string? text)
    {
        var t = text?.Trim();
        return string.IsNullOrEmpty(t) ? null : t;
    }
}
