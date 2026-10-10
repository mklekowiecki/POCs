namespace TeacherHelp.Session;

/// <summary>
/// Treść udostępnionych plików trzymana w katalogu tymczasowym (żeby duże pliki nie zajmowały RAM).
/// Katalog jest czyszczony przy starcie aplikacji i po zakończeniu sesji.
/// </summary>
public sealed class FileStorage
{
    private readonly string _root;

    public FileStorage(string root)
    {
        _root = root;
        Clear();
    }

    public async Task<long> SaveAsync(string id, Stream content, CancellationToken ct)
    {
        var path = PathFor(id);
        await using var target = File.Create(path);
        await content.CopyToAsync(target, ct);
        return target.Length;
    }

    public Stream? OpenRead(string id)
    {
        var path = PathFor(id);
        return File.Exists(path) ? File.OpenRead(path) : null;
    }

    public void Delete(string id)
    {
        try { File.Delete(PathFor(id)); } catch (Exception e) when (e is IOException or UnauthorizedAccessException) { /* plik właśnie pobierany - zniknie przy Clear */ }
    }

    public void Clear()
    {
        try { if (Directory.Exists(_root)) Directory.Delete(_root, recursive: true); }
        catch (Exception e) when (e is IOException or UnauthorizedAccessException) { /* plik w użyciu - zostanie */ }
        Directory.CreateDirectory(_root);
    }

    // Id generujemy sami (Guid "N"), ale sprawdzamy format, żeby nikt nie wyszedł poza katalog.
    private string PathFor(string id) =>
        Guid.TryParseExact(id, "N", out _) ? Path.Combine(_root, id) : throw new ArgumentException("Nieprawidłowy identyfikator pliku.", nameof(id));
}
