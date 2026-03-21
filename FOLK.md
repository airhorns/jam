# Folk Computer: Programming Model Deep Dive

A comprehensive reference on Folk's reactive, natural-language programming primitives — their semantics, composition, execution model, and performance characteristics. Intended to guide a similar implementation.

---

## 1. Philosophy & Lineage

Folk is a physical computing system by Omar Rizwan and Andres Cuervo. Programs live on physical paper (identified by AprilTags), executed by a projector-camera setup that reads code and projects output onto a table surface. But the interesting part isn't the hardware — it's the programming model.

Folk self-describes as a **"Natural-language Datalog reactive database."** The core insight: programs don't call each other. They make **statements** into a shared reactive database, and other programs **react** to those statements. There is no message passing, no function calls between programs, no imports. Just a shared space of natural-language facts.

### Intellectual Heritage

| Ancestor | What Folk takes from it |
|----------|------------------------|
| **Linda tuple spaces** | Coordination through a shared statement space rather than direct messaging. Programs are decoupled — they don't know who they're talking to. |
| **Datalog** | Pattern matching with variable binding, rule evaluation, join semantics. Folk is literally "natural-language Datalog." |
| **nl-datalog (Alex Warth / HARC)** | The natural-language syntax itself — slash-delimited variables in English sentences — was invented here. |
| **Dynamicland / Realtalk** | Folk's direct predecessor. The When/Wish/Claim paradigm originates from Realtalk. Folk is the open-source continuation. |
| **Prolog** | Declarative style — you define desired behavior, not execution sequences. |
| **Erlang** | The folk2 evaluator uses Erlang-like preemptive multitasking with work-stealing. |

### Why Tcl?

Folk is implemented in Tcl (specifically Jim Tcl) + C. There is no custom parser — `When`, `Wish`, `Claim` are all plain Tcl procedures. Tcl was chosen because:
- **Extensible syntax**: language constructs look native, not like API calls
- **Excellent C interop**: inline C compilation, FFI, shared libraries
- **Strong threading**: better than any other scripting language for Folk's concurrent model
- **String-based**: everything is a string, easy to network-serialize and ship around
- **Multiline strings**: `{curly braces}` make embedded code blocks natural

---

## 2. The Core Primitives

### 2.1 Claim — Assert facts

`Claim` adds a statement (fact) to the shared reactive database. Other programs can pattern-match against these claims and react to them.

```tcl
Claim $this is cool
Claim Omar is cool
Claim Omar is a person with 2 legs
Claim $this has camera slice $subimage
Claim the fps is $fps
```

**Semantics:**
- `Claim X Y Z` is sugar for `Say $this claims X Y Z` — the claiming program's identity is automatically prefixed.
- Claims are **scoped to their creator**: when a program is removed (paper lifted off table), all its claims are automatically retracted.
- Claims are **scoped to their reactive context**: if a Claim is made inside a `When` block, it is automatically retracted when that `When` stops matching.
- Best practice: scope claims to `$this` to prevent collisions between program instances.

**Implementation detail — "Claimization":** When a `When` pattern like `When /x/ is cool` is evaluated, the system also searches for `/someone/ claims /x/ is cool`. This "claimization" is done automatically in C (`claimizeClause()`), transparently bridging the gap between what you write and what's stored.

### 2.2 Wish — Declare desired states

`Wish` is mechanically identical to `Claim` — it inserts a statement into the database. The difference is purely **conventional**: Claims assert facts about the world, Wishes express desires that some other program should fulfill.

```tcl
Wish $this is labelled "Hello, world!"
Wish $this is outlined red
Wish $actor is outlined red
Wish to draw a circle with center $c radius 4 color white filled true
Wish the GPU draws pipeline "image" with arguments $args
Wish the web server handles route "/frame" with handler $h
```

**The Claim/Wish convention is the backbone of Folk's composition model.** A Wish is a request thrown into the void. Somewhere, a "virtual program" (a built-in service) has a `When` that matches that wish pattern and fulfills it. For example:

- `Wish $this is labelled "text"` → matched by `label.folk`, which renders text
- `Wish $this is outlined red` → matched by `outline.folk`, which draws outlines
- `Wish to draw an image ...` → matched by the image rendering system

This means **any program can extend the vocabulary of Wishes** by writing a `When` that matches a new wish pattern. The system is infinitely extensible without any central registry.

### 2.3 When — Reactive pattern matching

`When` is the reactive core. It creates a rule: whenever matching statements exist in the database, execute the body. The body re-executes automatically when matches change. When matches disappear, everything produced by the body is automatically revoked.

```tcl
When /actor/ is cool {
    Wish $this is labelled "$actor seems pretty cool"
    Wish $actor is outlined red
}
```

**Variable binding:** `/actor/` captures the value at that position into `$actor`. Any word wrapped in slashes becomes a pattern variable.

**Multiple matches fire independently:** If both "Omar is cool" and "Alice is cool" exist, the body runs twice — once with `$actor = Omar`, once with `$actor = Alice`.

#### Pattern Variable Flavors

| Syntax | Behavior |
|--------|----------|
| `/varName/` | Captures and binds value to `$varName` |
| `/someone/`, `/something/`, `/anyone/`, `/anything/` | Non-capturing wildcard — matches any value without binding |
| `/nobody/`, `/nothing/` | **Negation** — body fires only when NO matching statement exists |
| `/...varName/` | **Rest variable** — captures all remaining terms as a list |
| `/_/` | Wildcard, ignore this value |

#### Negation

```tcl
When /nobody/ is cool {
    Wish $this is labelled "nobody is cool :("
}
```

This fires only when zero statements match the pattern. When even one match appears, the body's effects are revoked. This is "negation as absence" — a powerful primitive for default behavior.

#### Joins with `&`

Multiple patterns combined with `&`, where shared variable names create equi-join conditions:

```tcl
When /x/ is cool & /x/ is a person with /n/ legs {
    Wish $this is labelled "$x is a cool person with $n legs"
}
```

`$x` must be the same value across both patterns. Internally, joins are desugared into nested `When` blocks — the second pattern becomes a nested `When` inside the first.

More complex joins:

```tcl
When $this' is taking a tableshot &
     $this' has camera slice /slice/ &
     the clock time is /t/ {
    set t [int $t]
    set fp "/tmp/$this-$t.jpg"
    ...
}
```

#### Automatic Revocation (the killer feature)

When a statement that triggered a `When` block disappears, **all Claims and Wishes produced by that execution are automatically retracted**, and their downstream effects cascade. This is the single most important property of the system:

- You never manually clean up state
- You never write teardown code for the happy path
- The dependency graph handles lifecycle automatically
- Programs compose without knowing about each other

This is what makes the system feel "live" — lift a piece of paper off the table and everything it caused vanishes instantly.

### 2.4 Collected Results — Aggregation

Instead of firing the body once per match, aggregate all matches into a single execution:

```tcl
When the collected results for [list /actor/ is cool] are /results/ {
    Wish $this is labelled [join $results "\n"]
}
```

Also available as "collected matches" which returns a list of dictionaries:

```tcl
When the collected matches for [list /p/ has tableshot /ts/] are /matches/ {
    set images [lmap m $matches {dict get $m ts}]
}
```

This is essential for any operation that needs a global view — counting, summarizing, rendering lists, etc.

### 2.5 Hold! — Mutable persistent state

`Hold!` creates statements that **persist across reactive re-evaluations** and **overwrite** previous Hold! calls from the same scope/key. This is the escape hatch for mutable state in an otherwise declarative system.

```tcl
Hold! { Claim $this has a ball at x 100 y 100 }
```

Each subsequent `Hold!` from the same program replaces the previous one. This gives you a single mutable "cell" per program.

**Named keys** for multiple independent state atoms:

```tcl
Hold! ball_position { Claim $this has a ball at x 100 y 100 }
Hold! score { Claim $this has score 0 }
```

**Cross-program targeting:**

```tcl
Hold! (on 852) { Claim ... }
Hold! (on builtin-programs/example.folk) { ... }
```

**Stateful animation example:**

```tcl
Hold! { Claim $this has a ball at x 100 y 100 }

When $this has a ball at x /x/ y /y/ {
    puts "ball at $x $y"
    After 10 milliseconds {
        Hold! { Claim $this has a ball at x $x y [expr {$y+1}] }
    }
}
```

Each `Hold!` triggers the `When` to re-fire with new values, creating a loop. This is how you do animation and stateful updates.

### 2.6 Commit — Frame-persistent state

Similar to Hold!, designed to prevent expensive operations from re-executing. Commit persists state and an empty Commit clears it:

```tcl
Commit $this' { Claim $this' has tableshot $fp }

# Clear:
When /someone/ wishes to clear tableshots & /p/ has tableshot /ts/ {
    Commit $p {}
}
```

### 2.7 Subscribe: / Notify: — Event System

A pub/sub mechanism for discrete events (as opposed to continuous reactive state). Subscribe bodies **cannot** contain Claims/Whens/Wishes — only `Hold!`.

```tcl
Hold! { Claim $this has seen 0 boops }

Subscribe: there is a boop {
    ForEach! $this has seen /n/ boops {
        Hold! { Claim $this has seen [expr {$n + 1}] boops }
    }
}

# Somewhere else:
Notify: there is a boop
```

This is the right tool for discrete actions (button presses, one-shot triggers) as opposed to continuous state (position, time, sensor readings).

### 2.8 Query! / QueryOne! / ForEach! — Imperative queries

Point-in-time queries against the statement database, for use in imperative contexts:

```tcl
set results [Query! /x/ is cool & /x/ is a person]
# Returns: list of dicts like {x Omar} {x Alice}

ForEach! /x/ is cool {
    puts "$x is cool"
}
```

### 2.9 On unmatch — Cleanup handler

Registers a destructor that fires when the enclosing `When` stops matching. For side-effectful cleanup (killing processes, releasing resources). Should NOT contain Claims/Wishes.

```tcl
When $this is active {
    set pid [exec python3 server.py &]
    On unmatch {
        kill $pid
    }
}
```

### 2.10 fn — Lexical functions

```tcl
fn CRAFT {im} { return [$py detectTextBoxes $im] }
Claim the CRAFT text detector is [fn CRAFT]
```

Functions capture their lexical environment, can be serialized, and passed through statements.

### 2.11 Assert! / Retract! — Low-level database ops

Direct, non-reactive insertion/removal. Assert creates "orphan" statements with no parent match. Retract pattern-matches and removes. **Generally avoid these in favor of the reactive primitives.**

---

## 3. The Execution Model

### 3.1 The Reactive Database (Trie-based)

All statements live in a **global reactive database** indexed by a **custom trie** implemented in C. The trie indexes **word-by-word**, enabling wildcard matching at any position in a statement.

```
Statement: "Omar claims Omar is a person with 2 legs"
Trie path:  Omar → claims → Omar → is → a → person → with → 2 → legs
```

When a `When` pattern contains variables (`/x/`), the trie lookup treats those positions as wildcards, returning all matching statements.

### 3.2 The Reaction Cycle

When a new statement S is inserted:
1. **Find matching Whens:** Query the trie for all `when ...` statements whose patterns match S. Schedule `RUN_WHEN` for each.
2. **If S is a When:** Query the trie for all existing statements matching S's pattern. Schedule `RUN_WHEN` for each.
3. **Claimized matching:** If S is `X claims Y`, also look for Whens matching just `Y` (and vice versa).

When a statement S is removed:
1. Find all Matches (When-executions) that were triggered by S.
2. Retract all child statements produced by those Matches.
3. Cascade: those retractions may trigger further retractions downstream.

### 3.3 Statement → Match → Statement (Dependency Graph)

The core data structure is a bipartite graph:

```
Statement ──triggers──→ Match (a When-execution)
Match ──produces──→ Statement (Claims/Wishes made in the body)
Statement ──triggers──→ Match ...
```

**Statements** have:
- A clause (the content — array of words)
- Parent count (number of Matches that keep it alive)
- Child matches (Matches triggered by this statement)
- Lifecycle metadata (keepMs, source info, atomically version)

**Matches** have:
- Child statements (Claims/Wishes produced during body execution)
- Completion status
- Destructor set (On unmatch handlers)
- Worker thread affinity

When a Statement's parent count drops to 0, it's deindexed from the trie. This cascades to its child Matches, which cascade to their child Statements, and so on.

### 3.4 Threading Model (folk2)

- **Worker pool:** One thread per CPU core minus 1 (for Linux)
- **Work-stealing deques:** Each thread has a local Chase-Lev deque. Idle threads steal from random others.
- **Global overflow queue:** MPMC queue (16,384 capacity) for overflow.
- **Sysmon thread:** Runs every 3ms, inspired by Go's sysmon:
  - Collects epoch garbage
  - Manages deferred statement removals (`-keep` durations)
  - Detects I/O-blocked threads, spawns replacements
  - Updates time statements (`the clock time is ...`)
- **Epoch-based memory reclamation:** Lock-free concurrent access to the trie. Garbage from 2 epochs ago is safely freed.

Work items in the queue:
```c
enum WorkQueueOp { NONE, ASSERT, RETRACT, RUN_WHEN, RUN_SUBSCRIBE, EVAL };
```

---

## 4. How Primitives Combine

### 4.1 The Claim/Wish/When Triangle

The fundamental composition pattern:

```
Program A: Claim $this is cool           ─── states a fact
Program B: When /x/ is cool { ... }      ─── reacts to the fact
Program B: Wish $x is outlined red       ─── desires an effect
Program C: When /someone/ wishes /p/ is outlined /color/ { ... }  ─── fulfills the desire
```

Programs never reference each other. Program A doesn't know Program B exists. Program B doesn't know who will outline things. The database is the only coupling point.

### 4.2 Service Pattern (Virtual Programs)

Built-in "virtual programs" implement common services by matching Wish patterns:

```tcl
# In label.folk (built-in):
When /someone/ wishes /p/ is labelled /text/ {
    # ... render text at p's location
}

# In any user program:
Wish $this is labelled "Hello!"  # Just works
```

**Any user program can define new services the same way.** There's no distinction between built-in and user-defined wish handlers.

### 4.3 Spatial Composition (Physical Proximity)

Programs interact through physical proximity on the table:

```tcl
# Program A: "I'm a dial"
When $this has region /r/ {
    set angle [region angle $r]
    set fps [expr { round(30 * abs($angle / 3.1415)) }]
    Claim the fps is $fps
}

# Program B: "I react to fps"
When the fps is /fps/ {
    Wish $this is labelled "FPS: $fps"
}
```

Rotating the physical paper changes the claimed FPS, which reactively updates Program B's label. No wiring required.

### 4.4 Neighbor / Points-at Patterns

```tcl
# When this program physically touches another:
When $this has neighbor /n/ {
    Claim $n is taking a tableshot
}

# When this program physically points at another:
When $this points up at /p/ {
    Wish $p is labelled "I'm being pointed at!"
}
```

### 4.5 Camera → Compute → Display Pipeline

```tcl
# 1. Camera provides frames (built-in)
# Statement: "the camera frame is <frame>"

# 2. Program reads its own camera slice
When the camera frame is /f/ & /p/ has region /r/ {
    lassign [regionToBbox $r] minX minY maxX maxY
    lassign [projectorToCamera [list $minX $minY]] px0 py0
    lassign [projectorToCamera [list $maxX $maxY]] px1 py1
    set subimage [image subimage $f $x $y $w $h]
    Claim $p has camera slice $subimage
}

# 3. Program processes its camera slice
When $this has camera slice /slice/ {
    # ... run ML model, detect text, etc.
    Claim $this detected text $result
}

# 4. Another program displays the result
When /p/ detected text /result/ {
    Wish $p is labelled $result
}
```

### 4.6 Stateful Interactions (Hold! + Subscribe/Notify)

```tcl
# Counter with button
Hold! { Claim $this has count 0 }

When $this has count /n/ {
    Wish $this is labelled "Count: $n"
}

Subscribe: $this was tapped {
    ForEach! $this has count /n/ {
        Hold! { Claim $this has count [expr {$n + 1}] }
    }
}

# Some input system:
When $this has neighbor /n/ & /n/ is a button {
    Notify: $this was tapped
}
```

### 4.7 The "When When" Pattern (Lazy/On-Demand)

Statements can be created only when someone asks for them — lazy evaluation:

```tcl
When when /p/ has processed image /result/ {
    # This only runs when another When needs "X has processed image Y"
    # Expensive computation deferred until demanded
}
```

---

## 5. Performance Characteristics & Optimization

### 5.1 Measured Performance

- **Raspberry Pi 4 class:** 5–15 fps
- **NUC/Beelink class (x86):** ~60 fps
- The system runs a full camera→compute→display pipeline every frame

### 5.2 The `-noncapturing` Flag

By default, `When` blocks capture their entire lexical environment (closure capture). This is expensive when the enclosing scope has many variables. The `-noncapturing` flag disables this:

```tcl
When -noncapturing /p/ is cool {
    Claim $p is awesome
}
```

Use this when the body only needs the pattern-bound variables, not any variables from the enclosing scope. This is a significant performance optimization for hot paths.

### 5.3 The `-serially` Flag

Prevents concurrent execution of the same When block:

```tcl
When -serially camera /camera/ has frame /frame/ at timestamp /t/ {
    # Only runs if the previous execution has completed
}
```

This prevents work pileup when a When body is slower than the rate of incoming matches (e.g., ML inference on camera frames).

### 5.4 The `-atomically` Flag (Transactional Convergence)

```tcl
When -atomically the clock time is /t/ {
    # Body runs, but downstream -atomically queries won't see
    # this version's statements until all inflight work converges
}
```

Creates a convergence-tracking subgraph. Queries with `-atomically` filter out statements whose computation hasn't fully settled. This prevents observers from seeing partial/inconsistent state during multi-step computations.

### 5.5 The `-keep` Flag (Temporal Smoothing)

```tcl
Claim -keep 100ms tag $tag has a program
```

The statement persists for 100ms after its parent is removed. This prevents **flicker** in reactive chains — e.g., when AprilTag detection briefly loses a tag between frames, the `-keep` duration bridges the gap so downstream programs don't blink.

Implemented via the sysmon thread's deferred removal queue.

### 5.6 Trie-Based Indexing

The statement database uses a **persistent (functional) trie** indexed word-by-word. This gives O(statement-length) lookup with wildcard matching at any position. Updates create new nodes via copy-on-write, with old nodes retired via epoch-based reclamation.

This is critical for performance: every `When` evaluation requires finding all matching statements, and every new statement requires finding all matching `When` rules. The trie makes both operations efficient.

### 5.7 Statement Deduplication

`dbInsertOrReuseStatement` checks if an identical statement already exists (via `trieLookupLiteral`) and reuses it rather than creating a duplicate. This reduces database churn in steady-state programs.

### 5.8 Known Performance Challenges

From the Folk team's own analysis, the evaluator handles:
- **Sustained long tasks**: well (one big ML inference per frame)
- **Many short tasks**: well (hundreds of simple Whens per frame)
- **Lots of medium-length tasks**: poorly — causes deadline misses and frame drops ("blinking")

The fundamental tension: preemptive scheduling adds overhead, but cooperative scheduling can't handle blocking I/O or runaway computations. Folk2 uses a hybrid approach with the sysmon thread detecting and working around blocked threads.

---

## 6. Complete Example Programs

### 6.1 Hello World

```tcl
Wish $this is labelled "Hello, world!"
```

That's it. The label virtual program matches this wish and renders text at the program's physical location.

### 6.2 Reactive Labelling

```tcl
When /actor/ is cool {
    Wish $this is labelled "$actor seems pretty cool"
    Wish $actor is outlined red
}
```

### 6.3 Clock Display

```tcl
When the clock time is /t/ {
    Wish $this is labelled $t
}
```

### 6.4 Physical Dial → FPS Control

```tcl
When $this has region /r/ {
    set angle [region angle $r]
    set fps [expr { round(30 * abs($angle / 3.1415)) }]
    Wish $this is labelled $fps
    Claim the fps is $fps
}
```

### 6.5 Animated Circle

```tcl
When the clock time is /t/ {
    Wish $this draws a circle with offset [list [expr {sin($t) * 50}] 0]
}
```

### 6.6 Stop-Motion Animation

```tcl
set N_FRAMES 5
set FPS 15

When $this has region /r/ {
    set display [region scale [region move $r down 75%] 45%]
    Claim $this has display $display
}

When $this has display /d/ {
    for {set i 1} {$i <= $N_FRAMES} {incr i} {
        Claim frame-$this-$i has region [region move $d right ${i}00%]
        Wish frame-$this-$i is outlined red

        When the clock time is /t/ & frame-$this-$i has camera slice /slice/ {
            if {round($t * $FPS) % $N_FRAMES == ($i - 1)} {
                Wish frame-$this-$i is outlined green
                set c [region centroid $d]
                Wish to draw an image with center $c image $slice radians 3.1459 scale 1
            }
        }
    }
}
```

### 6.7 Tableshot System (Full Multi-Primitive Example)

```tcl
When $this has neighbor /n/ {
    Claim $n is taking a tableshot
}

When $this has region /r/ {
    Wish $this' is outlined white
    Claim $this' has region [region move $r down 100%]
}

When $this' is taking a tableshot &
     $this' has camera slice /slice/ &
     the clock time is /t/ {
    set t [int $t]
    set fp "/tmp/$this-$t.jpg"

    When /nobody/ claims $this' has tableshot $fp {
        image saveAsJpeg $slice $fp
        Commit $this' { Claim $this' has tableshot $fp }
    }
}

When $this' has tableshot /ts/ {
    Wish $this displays image $ts
}
```

### 6.8 Physical Connection Visualization

```tcl
When /anyone/ wishes /source/ is connected to /sink/ &
     /source/ has region /source_region/ &
     /sink/ has region /sink_region/ {
    set source [region centroid $source_region]
    set sink [region centroid $sink_region]
    Wish to draw a stroke with points [list $source $sink] width 2 color grey
}
```

### 6.9 Error Display with Flashing Outline

```tcl
When /p/ has error /err/ with info /info/ {
    When the clock time is /t/ {
        if {[expr {(int($t * 5)) % 2}] == 1} {
            Wish $p is outlined white
        } else {
            Wish $p is outlined red
        }
    }
    Wish $p is titled $err
}
```

### 6.10 Stateful Counter

```tcl
Hold! { Claim $this has seen 0 boops }

Subscribe: there is a boop {
    ForEach! $this has seen /n/ boops {
        Hold! { Claim $this has seen [expr {$n + 1}] boops }
    }
}

When $this has seen /n/ boops {
    Wish $this is labelled "Boops: $n"
}
```

---

## 7. Primitive Reference Table

| Primitive | Purpose | Reactive? | Contains Claims/Wishes? | Lifecycle |
|-----------|---------|-----------|------------------------|-----------|
| `Claim` | Assert a fact | Yes (triggers Whens) | N/A | Auto-retracted when creator removed |
| `Wish` | Declare desired state | Yes (triggers Whens) | N/A | Auto-retracted when creator removed |
| `When` | React to patterns | Yes (fires on match) | Yes | Body effects revoked on unmatch |
| `Hold!` | Mutable persistent state | Yes (its Claims trigger Whens) | Yes (inside body) | Overwrites previous Hold! |
| `Commit` | Frame-persistent state | Yes | Yes (inside body) | Persists across frames |
| `Subscribe:` | Listen for events | No (imperative) | No — only `Hold!` | Persistent |
| `Notify:` | Fire event | No (imperative) | N/A | One-shot |
| `Query!` | Point-in-time query | No (imperative) | N/A | Returns immediately |
| `ForEach!` | Iterate over matches | No (imperative) | N/A | Returns immediately |
| `Assert!` | Low-level insert | Yes (triggers Whens) | N/A | No auto-retraction (orphan) |
| `Retract!` | Low-level remove | Yes (cascades) | N/A | Immediate |
| `On unmatch` | Cleanup handler | Triggered on unmatch | No — side effects only | One-shot |
| `fn` | Define function | No | N/A | Captures lexical env |

### Performance Flags

| Flag | On | Effect |
|------|-----|--------|
| `-noncapturing` | `When` | Disables lexical env capture — major perf win |
| `-serially` | `When` | Prevents concurrent execution of same When |
| `-atomically` | `When` | Convergence tracking — observers see consistent state |
| `-keep <duration>` | `Claim`/`Say` | Statement persists after parent removed (temporal smoothing) |

### Pattern Variables

| Syntax | Behavior |
|--------|----------|
| `/varName/` | Capture and bind |
| `/someone/` `/something/` `/anyone/` `/anything/` | Non-capturing wildcard |
| `/nobody/` `/nothing/` | Negation — fires when NO match exists |
| `/...varName/` | Rest — captures remaining terms as list |
| `/_/` | Explicit ignore |

---

## 8. Key Design Insights for Re-Implementation

### 8.1 Statements are the only interface

Programs never call each other. The statement database is the **only** coupling point. This makes the system:
- **Infinitely composable**: any program can react to any statement
- **Naturally concurrent**: no shared mutable state between programs
- **Self-cleaning**: remove a program, and all its effects vanish

### 8.2 Wish/Claim split is convention, not mechanism

Both are just statements. The semantic split creates a natural **protocol**: Claims describe the world, Wishes describe intent. This convention makes programs self-documenting and enables the "service" pattern where generic fulfillment programs match wish patterns.

### 8.3 Automatic revocation is the killer feature

The automatic retraction cascade through the dependency graph means you almost never write cleanup code. This is what makes the system feel "live" and makes programs safe to compose without coordination.

### 8.4 Natural language is load-bearing

The choice to use natural-language statements (not structured tuples or JSON) is deliberate. It means:
- Programs are readable by non-programmers
- New "protocols" emerge by convention (just start using new sentence patterns)
- No schema definition or type registration required
- The trie does word-by-word matching, which gives you free partial matching

### 8.5 Negation enables defaults

The `/nobody/` pattern is surprisingly powerful. It lets you express: "do this only if nobody else has done it." This enables default behaviors, fallback rendering, one-shot triggers, and exactly-once semantics.

### 8.6 Hold! bridges declarative and imperative

Pure reactive systems struggle with state. Hold! solves this elegantly — it's a single mutable cell that participates in the reactive graph. Each Hold! overwrites the previous, triggering re-evaluation of any When blocks that matched the old value. This gives you state machines, counters, animation, and game loops without breaking the declarative model.

### 8.7 The trie is the performance story

The word-by-word trie with wildcard matching is what makes the whole system viable. Every statement insertion needs to find matching Whens, and every When needs to find matching statements. The trie makes both O(statement-length) instead of O(database-size). Combined with epoch-based reclamation for lock-free concurrent access, this is what enables 60fps on commodity hardware.

### 8.8 Temporal smoothing (`-keep`) is essential for physical systems

Physical sensors (cameras, tag detectors) are noisy. Tags appear and disappear between frames. Without `-keep`, this causes cascade retractions and re-assertions 30+ times per second, creating visible flicker. The `-keep` flag bridges these gaps, acting as a low-pass filter on the reactive graph.

---

## 9. Sources

- [folk.computer](https://folk.computer) — official website
- [FolkComputer/folk on GitHub](https://github.com/FolkComputer/folk) — source code
- [Folk Design Document](https://github.com/FolkComputer/folk/blob/main/docs/design.md)
- [Folk newsletters](https://folkcomputer.substack.com/) (2023–2026)
- [folk.computer/guides](https://folk.computer/guides/example-programs) — example programs, GPU, OpenCV guides
- [folk.computer/notes/tableshots](https://folk.computer/notes/tableshots) — tableshot system walkthrough
- [nl-datalog (HARC/Alex Warth)](https://github.com/harc/nl-datalog) — the natural-language syntax origin
- [Towards a Folk Computer (Cristobal Sciutto)](https://cristobal.space/writing/folk-computer.html) — excellent external analysis
- [Dynamicland FAQ](https://dynamicland.org/2024/FAQ/) — predecessor context
