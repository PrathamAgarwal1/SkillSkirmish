// battles/content/languages.js — CodeGuessr "Language Map": a world map of programming languages.
//
// Languages sit in regions by family, so a near miss (Kotlin for Java) still scores well and a wild
// guess (COBOL for Haskell) scores nothing. Coordinates are on a 1000 × 620 map. Snippets never name
// the language.

const REGIONS = [
    { id: 'web', name: 'Web Peninsula', x: 210, y: 140 },
    { id: 'apple', name: 'Apple Coast', x: 120, y: 320 },
    { id: 'c', name: 'C-Family Continent', x: 340, y: 330 },
    { id: 'jvm', name: 'JVM Island', x: 560, y: 160 },
    { id: 'dotnet', name: '.NET Bay', x: 470, y: 270 },
    { id: 'script', name: 'Scripting Plains', x: 240, y: 500, label: [215, 585] },
    { id: 'shell', name: 'Shell Cliffs', x: 380, y: 520 },
    { id: 'functional', name: 'Functional Archipelago', x: 740, y: 320 },
    { id: 'beam', name: 'BEAM Atoll', x: 790, y: 440 },
    { id: 'lisp', name: 'Lisp Isles', x: 840, y: 130 },
    { id: 'data', name: 'Data Desert', x: 580, y: 490 },
    { id: 'legacy', name: 'Legacy Tundra', x: 860, y: 560 }
];

const L = (id, name, region, x, y, difficulty, snippets) => ({ id, name, region, x, y, difficulty, snippets });

const LANGUAGES = [
    L('javascript', 'JavaScript', 'web', 190, 150, 'easy', [
        `const total = items\n  .filter(item => item.inStock)\n  .reduce((sum, item) => sum + item.price, 0);\n\ndocument.querySelector('#total').textContent = total.toFixed(2);`,
        `async function loadUser(id) {\n  const res = await fetch(\`/api/users/\${id}\`);\n  if (!res.ok) throw new Error('Not found');\n  return res.json();\n}`
    ]),
    L('typescript', 'TypeScript', 'web', 245, 115, 'easy', [
        `interface User {\n  id: number;\n  name: string;\n  email?: string;\n}\n\nfunction greet(user: User): string {\n  return \`Hello, \${user.name}\`;\n}`,
        `type Result<T> = { ok: true; value: T } | { ok: false; error: string };\n\nconst parse = (s: string): Result<number> =>\n  isNaN(+s) ? { ok: false, error: 'NaN' } : { ok: true, value: +s };`
    ]),
    L('dart', 'Dart', 'web', 150, 200, 'medium', [
        `class Counter extends StatelessWidget {\n  final int count;\n  const Counter({super.key, required this.count});\n\n  @override\n  Widget build(BuildContext context) => Text('Count: $count');\n}`,
        `void main() {\n  final names = <String>['Ana', 'Ben'];\n  for (final name in names) {\n    print('Hi \${name.toUpperCase()}');\n  }\n}`
    ]),
    L('swift', 'Swift', 'apple', 110, 300, 'easy', [
        `struct Point {\n    var x: Double\n    var y: Double\n}\n\nlet points = [Point(x: 1, y: 2), Point(x: 3, y: 4)]\nlet xs = points.map { $0.x }\nprint(xs)`,
        `guard let url = URL(string: urlString) else {\n    return nil\n}\nlet (data, _) = try await URLSession.shared.data(from: url)`
    ]),
    L('objective-c', 'Objective-C', 'apple', 150, 365, 'hard', [
        `@interface Person : NSObject\n@property (nonatomic, strong) NSString *name;\n- (void)sayHello;\n@end\n\n@implementation Person\n- (void)sayHello { NSLog(@"Hello, %@", self.name); }\n@end`,
        `NSArray *items = @[@"a", @"b", @"c"];\nfor (NSString *item in items) {\n    [self.list addObject:[item uppercaseString]];\n}`
    ]),
    L('c', 'C', 'c', 300, 340, 'easy', [
        `#include <stdio.h>\n\nint main(void) {\n    int nums[] = {3, 1, 4};\n    for (int i = 0; i < 3; i++)\n        printf("%d\\n", nums[i]);\n    return 0;\n}`,
        `char *dup = malloc(strlen(src) + 1);\nif (dup == NULL) {\n    return NULL;\n}\nstrcpy(dup, src);\nfree(old);`
    ]),
    L('cpp', 'C++', 'c', 345, 300, 'easy', [
        `#include <vector>\n#include <algorithm>\n\nstd::vector<int> v{5, 2, 8};\nstd::sort(v.begin(), v.end());\nfor (const auto& x : v) std::cout << x << '\\n';`,
        `template <typename T>\nclass Stack {\npublic:\n    void push(T value) { items_.push_back(std::move(value)); }\nprivate:\n    std::vector<T> items_;\n};`
    ]),
    L('rust', 'Rust', 'c', 395, 355, 'medium', [
        `fn main() {\n    let words = vec!["hi", "there"];\n    let lens: Vec<usize> = words.iter().map(|w| w.len()).collect();\n    println!("{:?}", lens);\n}`,
        `match config.get("port") {\n    Some(p) => p.parse::<u16>()?,\n    None => 8080,\n}`
    ]),
    L('go', 'Go', 'c', 360, 400, 'easy', [
        `func main() {\n\tnames := []string{"a", "b"}\n\tfor i, name := range names {\n\t\tfmt.Println(i, name)\n\t}\n}`,
        `resp, err := http.Get(url)\nif err != nil {\n\treturn nil, err\n}\ndefer resp.Body.Close()`
    ]),
    L('zig', 'Zig', 'c', 300, 395, 'hard', [
        `const std = @import("std");\n\npub fn main() !void {\n    const stdout = std.io.getStdOut().writer();\n    try stdout.print("Hello, {s}!\\n", .{"world"});\n}`,
        `fn add(a: i32, b: i32) i32 {\n    return a + b;\n}\n\ntest "add works" {\n    try std.testing.expect(add(2, 2) == 4);\n}`
    ]),
    L('csharp', 'C#', 'dotnet', 455, 255, 'easy', [
        `public class Order\n{\n    public int Id { get; set; }\n    public decimal Total { get; init; }\n}\n\nvar big = orders.Where(o => o.Total > 100).ToList();`,
        `using var client = new HttpClient();\nstring json = await client.GetStringAsync(url);\nConsole.WriteLine($"Got {json.Length} chars");`
    ]),
    L('fsharp', 'F#', 'dotnet', 560, 290, 'hard', [
        `let square x = x * x\n\nlet result =\n    [1..10]\n    |> List.filter (fun n -> n % 2 = 0)\n    |> List.map square\n\nprintfn "%A" result`,
        `type Shape =\n    | Circle of radius: float\n    | Rect of w: float * h: float\n\nlet area = function\n    | Circle r -> System.Math.PI * r * r\n    | Rect (w, h) -> w * h`
    ]),
    L('java', 'Java', 'jvm', 520, 175, 'easy', [
        `public class Main {\n    public static void main(String[] args) {\n        List<String> names = new ArrayList<>();\n        names.add("Ada");\n        System.out.println(names.size());\n    }\n}`,
        `@RestController\npublic class UserController {\n    @GetMapping("/users/{id}")\n    public User get(@PathVariable Long id) {\n        return repo.findById(id).orElseThrow();\n    }\n}`
    ]),
    L('kotlin', 'Kotlin', 'jvm', 565, 145, 'medium', [
        `data class User(val name: String, val age: Int)\n\nfun main() {\n    val adults = listOf(User("Ann", 30), User("Bo", 12)).filter { it.age >= 18 }\n    println(adults)\n}`,
        `val name: String? = intent.getStringExtra("name")\nval greeting = name?.let { "Hi, $it" } ?: "Hi there"`
    ]),
    L('scala', 'Scala', 'jvm', 610, 190, 'medium', [
        `case class Point(x: Int, y: Int)\n\nobject Main extends App {\n  val pts = List(Point(1, 2), Point(3, 4))\n  println(pts.map(_.x).sum)\n}`,
        `def describe(x: Any): String = x match {\n  case 0 => "zero"\n  case s: String => s"string $s"\n  case _ => "something else"\n}`
    ]),
    L('groovy', 'Groovy', 'jvm', 535, 225, 'hard', [
        `def names = ['ann', 'bob']\nnames.each { println it.capitalize() }\n\ndef map = [a: 1, b: 2]\nprintln map.collect { k, v -> "$k=$v" }.join('&')`,
        `pipeline {\n    agent any\n    stages {\n        stage('Build') {\n            steps { sh './gradlew build' }\n        }\n    }\n}`
    ]),
    L('clojure', 'Clojure', 'lisp', 720, 165, 'medium', [
        `(defn square [x] (* x x))\n\n(->> (range 10)\n     (filter even?)\n     (map square)\n     (reduce +))`,
        `(def user {:name "Ann" :age 31})\n(println (str "Hi " (:name user)))\n(swap! counter inc)`
    ]),
    L('common-lisp', 'Common Lisp', 'lisp', 820, 105, 'hard', [
        `(defun factorial (n)\n  (if (<= n 1)\n      1\n      (* n (factorial (- n 1)))))\n\n(format t "~a~%" (factorial 10))`,
        `(loop for x in '(1 2 3 4)\n      when (evenp x)\n        collect (* x x))`
    ]),
    L('scheme', 'Scheme', 'lisp', 875, 155, 'hard', [
        `(define (sum-list lst)\n  (if (null? lst)\n      0\n      (+ (car lst) (sum-list (cdr lst)))))\n\n(display (sum-list '(1 2 3)))`,
        `(let loop ((i 0))\n  (when (< i 3)\n    (display i)\n    (newline)\n    (loop (+ i 1))))`
    ]),
    L('racket', 'Racket', 'lisp', 885, 85, 'hard', [
        `(define (greet name)\n  (string-append "Hello, " name))\n\n(for ([n (in-range 3)])\n  (displayln (greet (number->string n))))`,
        `(struct point (x y) #:transparent)\n(define p (point 1 2))\n(match p\n  [(point x y) (+ x y)])`
    ]),
    L('haskell', 'Haskell', 'functional', 760, 335, 'medium', [
        `main :: IO ()\nmain = do\n  let evens = filter even [1..10]\n  print (sum (map (^2) evens))`,
        `data Shape = Circle Double | Square Double\n\narea :: Shape -> Double\narea (Circle r) = pi * r * r\narea (Square s) = s * s`
    ]),
    L('ocaml', 'OCaml', 'functional', 690, 295, 'hard', [
        `let rec fib n =\n  if n < 2 then n\n  else fib (n - 1) + fib (n - 2)\n\nlet () = Printf.printf "%d\\n" (fib 20)`,
        `type color = Red | Green | Blue\n\nlet to_string = function\n  | Red -> "red"\n  | Green -> "green"\n  | Blue -> "blue"`
    ]),
    L('elm', 'Elm', 'functional', 810, 265, 'hard', [
        `type Msg = Increment | Decrement\n\nupdate : Msg -> Model -> Model\nupdate msg model =\n    case msg of\n        Increment -> model + 1\n        Decrement -> model - 1`,
        `view : Model -> Html Msg\nview model =\n    div []\n        [ button [ onClick Decrement ] [ text "-" ]\n        , text (String.fromInt model)\n        ]`
    ]),
    L('elixir', 'Elixir', 'beam', 760, 425, 'medium', [
        `defmodule Greeter do\n  def hello(name), do: "Hello, #{name}"\nend\n\n[1, 2, 3]\n|> Enum.map(&(&1 * 2))\n|> IO.inspect()`,
        `case File.read("config.json") do\n  {:ok, body} -> Jason.decode!(body)\n  {:error, reason} -> raise "Failed: #{reason}"\nend`
    ]),
    L('erlang', 'Erlang', 'beam', 815, 465, 'hard', [
        `-module(math_utils).\n-export([double/1]).\n\ndouble(X) -> X * 2.`,
        `loop(State) ->\n    receive\n        {add, N} -> loop(State + N);\n        {get, Pid} -> Pid ! State, loop(State)\n    end.`
    ]),
    L('python', 'Python', 'script', 180, 470, 'easy', [
        `def word_counts(text):\n    counts = {}\n    for word in text.lower().split():\n        counts[word] = counts.get(word, 0) + 1\n    return counts\n\nprint(word_counts("a b a"))`,
        `with open("data.csv") as f:\n    rows = [line.strip().split(",") for line in f]\n\nnames = [r[0] for r in rows if r]`
    ]),
    L('ruby', 'Ruby', 'script', 245, 505, 'easy', [
        `class Dog\n  attr_reader :name\n\n  def initialize(name)\n    @name = name\n  end\nend\n\nputs Dog.new("Rex").name`,
        `[1, 2, 3].each do |n|\n  puts n * 2\nend\n\nsquares = (1..5).map { |x| x ** 2 }`
    ]),
    L('perl', 'Perl', 'script', 300, 540, 'hard', [
        `my %ages = (ann => 31, bob => 27);\nforeach my $name (sort keys %ages) {\n    print "$name is $ages{$name}\\n";\n}`,
        `while (my $line = <STDIN>) {\n    chomp $line;\n    next unless $line =~ /^(\\w+):\\s*(\\d+)/;\n    $total += $2;\n}`
    ]),
    L('php', 'PHP', 'script', 230, 425, 'easy', [
        `$users = ['ann', 'bob'];\nforeach ($users as $i => $user) {\n    echo "$i: " . ucfirst($user) . "<br>";\n}`,
        `function findUser(PDO $db, int $id): ?array {\n    $stmt = $db->prepare('SELECT * FROM users WHERE id = ?');\n    $stmt->execute([$id]);\n    return $stmt->fetch() ?: null;\n}`
    ]),
    L('lua', 'Lua', 'script', 135, 525, 'medium', [
        `local function greet(name)\n  return "Hello, " .. name\nend\n\nfor i = 1, 3 do\n  print(greet("player " .. i))\nend`,
        `local player = { hp = 100, name = "Hero" }\n\nfunction player:hit(dmg)\n  self.hp = self.hp - dmg\nend`
    ]),
    L('bash', 'Bash', 'shell', 360, 495, 'easy', [
        `set -euo pipefail\n\nfor f in *.log; do\n  echo "Compressing $f"\n  gzip "$f"\ndone`,
        `if [[ -z "\${API_KEY:-}" ]]; then\n  echo "API_KEY is not set" >&2\n  exit 1\nfi`
    ]),
    L('powershell', 'PowerShell', 'shell', 410, 545, 'medium', [
        `Get-ChildItem -Path . -Filter *.log |\n    Where-Object { $_.Length -gt 1MB } |\n    Remove-Item -WhatIf`,
        `$users = Import-Csv users.csv\nforeach ($u in $users) {\n    Write-Host "Adding $($u.Name)"\n}`
    ]),
    L('r', 'R', 'data', 545, 470, 'medium', [
        `df <- read.csv("sales.csv")\nsummary(df$revenue)\n\nlibrary(ggplot2)\nggplot(df, aes(x = month, y = revenue)) + geom_line()`,
        `scores <- c(90, 85, 77)\nnames(scores) <- c("ann", "bob", "cy")\nmean(scores[scores > 80])`
    ]),
    L('julia', 'Julia', 'data', 615, 455, 'hard', [
        `function mandel(c; maxiter=100)\n    z = 0.0im\n    for n in 1:maxiter\n        abs(z) > 2 && return n\n        z = z^2 + c\n    end\n    return maxiter\nend`,
        `using Statistics\n\nxs = [1.5, 2.0, 3.5]\nprintln(mean(xs), " ", std(xs))\nys = xs .^ 2`
    ]),
    L('matlab', 'MATLAB', 'data', 520, 530, 'medium', [
        `x = linspace(0, 2*pi, 100);\ny = sin(x);\nplot(x, y, 'r--');\ntitle('Sine wave');`,
        `A = [1 2; 3 4];\nB = A';\nC = A * B;\ndisp(C(1, :));`
    ]),
    L('sql', 'SQL', 'data', 650, 535, 'easy', [
        `SELECT c.name, SUM(o.total) AS spent\nFROM customers c\nJOIN orders o ON o.customer_id = c.id\nGROUP BY c.name\nORDER BY spent DESC\nLIMIT 5;`,
        `UPDATE accounts\nSET balance = balance - 100\nWHERE id = 42\n  AND balance >= 100;`
    ]),
    L('cobol', 'COBOL', 'legacy', 900, 575, 'medium', [
        `IDENTIFICATION DIVISION.\nPROGRAM-ID. HELLO.\nPROCEDURE DIVISION.\n    DISPLAY 'HELLO, WORLD'.\n    STOP RUN.`,
        `01 WS-TOTAL      PIC 9(5)V99 VALUE ZERO.\n01 WS-PRICE      PIC 9(3)V99.\n    ADD WS-PRICE TO WS-TOTAL.`
    ]),
    L('fortran', 'Fortran', 'legacy', 835, 545, 'medium', [
        `program sum_squares\n  implicit none\n  integer :: i, total\n  total = 0\n  do i = 1, 10\n    total = total + i**2\n  end do\n  print *, total\nend program sum_squares`,
        `real, dimension(100) :: x\nx = [(real(i) / 10.0, i = 1, 100)]\nprint '(F8.3)', sum(x)`
    ]),
    L('pascal', 'Pascal', 'legacy', 780, 575, 'hard', [
        `program Hello;\nvar\n  i: Integer;\nbegin\n  for i := 1 to 3 do\n    WriteLn('Hello ', i);\nend.`,
        `function Max(a, b: Integer): Integer;\nbegin\n  if a > b then Max := a else Max := b;\nend;`
    ]),
    L('assembly', 'Assembly (x86)', 'legacy', 935, 515, 'medium', [
        `section .data\n    msg db "Hello", 10\nsection .text\n    global _start\n_start:\n    mov rax, 1\n    mov rdi, 1\n    mov rsi, msg\n    mov rdx, 6\n    syscall`,
        `    xor ecx, ecx\nloop_start:\n    add eax, [ebx + ecx*4]\n    inc ecx\n    cmp ecx, 10\n    jl loop_start`
    ])
];

const MAP = { width: 1000, height: 620 };
const byId = new Map(LANGUAGES.map(l => [l.id, l]));

module.exports = { LANGUAGES, REGIONS, MAP, byId };
