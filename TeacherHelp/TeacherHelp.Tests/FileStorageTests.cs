using System.Text;
using TeacherHelp.Session;

namespace TeacherHelp.Tests;

public class FileStorageTests : IDisposable
{
    private readonly string _root = Path.Combine(Path.GetTempPath(), "TeacherHelpTests", Guid.NewGuid().ToString("N"));

    public void Dispose()
    {
        if (Directory.Exists(_root)) Directory.Delete(_root, true);
    }

    [Fact]
    public async Task Saves_reads_deletes_and_clears()
    {
        var storage = new FileStorage(_root);
        var a = Guid.NewGuid().ToString("N");
        var b = Guid.NewGuid().ToString("N");

        Assert.Equal(5, await storage.SaveAsync(a, new MemoryStream(Encoding.UTF8.GetBytes("hello")), default));
        await storage.SaveAsync(b, new MemoryStream([1, 2, 3]), default);
        using (var reader = new StreamReader(storage.OpenRead(a)!))
            Assert.Equal("hello", await reader.ReadToEndAsync());

        storage.Delete(a);
        Assert.Null(storage.OpenRead(a));

        storage.Clear();
        Assert.Null(storage.OpenRead(b));
        Assert.True(Directory.Exists(_root));
    }

    [Fact]
    public void Rejects_ids_that_could_escape_the_directory()
    {
        var storage = new FileStorage(_root);
        Assert.Throws<ArgumentException>(() => storage.OpenRead("../secret"));
    }
}
