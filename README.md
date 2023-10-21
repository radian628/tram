# TRAM (True Random Access Memory)

**What if dereferencing a pointer always gave you a random memory location?** Could you get _any_ meaningful work done with such a system? It turns out that you _can_ get a _lot_ done with such a system, and this VM is my attempt to demonstrate it.

## Why?

Why not?

## Files

`vm.mjs` - A VM for the custom load-store architecture.

`examples.mjs` - An implementation of arbitrary reads/writes, which are then used to implement (very slow) bubble sort.

## How it Works

There are a few crucial assumptions made here to make this possible, as well as a few constraints to prevent "cheese-y" solutions:

1. We can initialize all registers and all memory to whatever we want.
2. Reads and writes are fixed-size and only read/write a single word. Misalignments are impossible.
3. Program code and memory take up separate address spaces. Random memory reads/writes affect the latter, not the former. Reads/writes to the program code (instruction pointer increments, jumps, et cetera) are all reliable and work as normal.
4. The only ways of accessing memory are:
   - A `load r1` instruction that moves a randomly-selected word from memory to a register `r1`.
   - A `store r1` instruction that moves a word from a register or number `r1` to a randomly-selected word in memory.
5. We have a set, finite number of registers that we can reliably read/write to/from. Ideally, we want to minimize the number of these as much as possible, and we _especially_ don't want the number of registers having to increase as the size of memory increases.

### Summary

A summary of the overall processes involved, without all of the discovery and explanation. **See below for a more detailed explanation**

"Memory" consists of both the `m` entries in the random access memory (where all accesses are random) _and_ a `hole` register to effectively contain an additional single memory location. All of these locations contain a unique tag and a single data bit. These unique tags act as memory addresses and are a list of consecutive integers, starting at `0` and ending at `m`.

##### Reading

1. Determine the tag of what memory location you want to read from.
2. First see if its tag matches `hole`'s tag and return `hole` if this is the case.
3. Otherwise, repeatedly `load` memory locations randomly until you get the one with the tag you want.

##### Writing

1. Determine the tag of the memory location you want to write from
2. Repeatedly perform the swap operation until `hole` contains the desired tag.
   1. To swap, first `store` the contents of `hole`, placing it in a random memory location (as `store` does) and thus overwriting that information
   2. Retrieve the tag you overwrote and place it in `hole`
      1. Set up a register `countup` as a counter, initialized to `0`,
      2. Set up another register `countdown` as a counter, initialized to `m`
      3. Repeatedly do the following:
         1. `load` a random memory location
         2. See if it's equal to `countup`. If it is, increment `countup` by 1.
         3. See if it's equal to `countdown`. If it is, decrement `countdown` by 1.
         4. If `countup = countdown`, then both are equal to the tag you need to put in `hole`.
   3. Retrieve the data bit you overwrote and also place it in `hole`
      1. Back up your previous checksum (`oldChecksum`).
      2. Sum up all the data bits of everything in memory (except for `hole`) to produce a new `checksum`.
      3. Compare `oldChecksum` to `checksum`. They can only differ by 1 because only one bit changed.
         - If the new `checksum` is greater than `oldChecksum`, a 0 must have become a 1, and thus the overwrote data bit is 0.
         - If the new `checksum` is less than `oldChecksum`, a 1 must have become a 0, and thus the overwrote data bit is 1.
         - If `checksum` equals `oldChecksum`, then nothing changed, and thus the overwrote data bit is equal to the one you set.
3. Change the data bit in `hole` to whatever you want.
4. Swap again to return the changed memory location to memory and ensure invariants are maintained.

### Overall Design

I'd like to take you through the design of this VM, walking you through the same design decisions I made. Keep in mind that the names I use for things like registers won't exactly match up with the VM because I only now have the hindsight I do now after making the VM. Anyway, let's first consider _how_ we'd actually get work done with such a VM. Ideally, we'd be able to use this system to replicate how a _normal_ computer works&mdash; In other words, we want to be able to _read_ to the memory address that we want, and we want to be able to _write_ to the memory address that we want, instead of just reading/writing to random locations.

The way normal computers do this is with memory addressing: You _dereference_ a pointer&mdash; a number that corresponds to a location in memory&mdash; to get some corresponding word in memory. Dereference the same pointer twice and you get the same memory. Write to the same address twice and the same memory is overwritten twice. The sameness makes it predictable, and what's what we want.

So if we want to implement memory addressing in a system where every memory access is random, how do we do it?

#### Tagged Memory

Currently, our random memory access system has no form of addressing. If two words&mdash; A and B&mdash; are both 0, and we access one of them, we don't know whether we just accessed A or B. We can't draw any meaningful distinction between two words of memory if the data inside them is identical. This means that in order to distinguish memory addresses from one another, we _need_ for them to contain _distinct data_. In other words, _every word in memory must always be unique._

We can do this by "tagging" the memory, logically splitting up each `n`-bit word into two pieces:

- An `n-1`-bit unique **tag**
- `1` bit of actual **data**

We can split it up in different ways to allow us to have more data per word, but for the sake of simplicity we'll go with the "`n-1`-bit tag, `1`-bit data" approach. The same concepts should transfer over to other tag/data distributions without much effort.

The important part here is that each tag is _unique_. Let's call this concept the "Unique Tag Invariant." In other words, if the tag of one word of memory is `3` (as a binary number), _no other_ word may have a tag of `3`. This way, whenever we see a tag of `3` when we do a read, we know for _sure_ that we're accessing one specific word and aren't confusing it for any other. Speaking of reading...

#### Reading

Now that we've got tagged memory, reading memory becomes easy, because we can treat the _tag_ as a _memory address_. To read, we repeatedly pick a random word from memory and check its tag against the tag we want to find. We keep on doing this over and over again until the tag of the memory address we read matches the one we want to find. Again, we know that the one we found is the one we want because of the Unique Tag Invariant. For an analogy, this is essentially equivalent to rummaging through a bag of uniquely-numbered pieces of paper, repeatedly taking pieces out and putting them back in until we find the one with the number we want on it. This runs in `O(m)` time, where `m` is the number of words in memory. Let's call this operation `read`.

#### Writing

Now that we've got reading, we can now work on writing. As a reminder, our goal is to figure out a way to _control what word we are writing to_. The cool thing with writing is that&mdash; unlike with reading&mdash; we can _control_ the tag that we end up writing. If we want a memory location to have the tag `5`, we can decide to write the tag `5` to that memory location, along with whatever bit of data we want. Regardless of _where_ that tag ends up in memory, we can now read it with the procedure from earlier! Well, we _would_ be able to read it, if it weren't for a few glaring problems:

1. We need to make sure that the tag is not a duplicate of any other tag. If it's a duplicate, we lose the Unique Tag Invariant and thus the ability to reliably read memory.
2. We need to somehow deal with the fact that we're overwriting an existing element with both its own _data_ (that we don't want to lose) and its own _tag_.
3. Even if we solve both of these, we still need to be able to _choose_ what we're writing to.

##### Problem 1: No Duplicate Tags

Let's tackle Problem 1 first: If we try to write to a memory location using a tag already in the set of used tags, we'll almost certainly end up with two of the same tag, breaking the Unique Tag Invariant. For instance, say that our memory has the tags `[0, 1, 2, 3, 4]`. We arbitrarily choose that we want to write something with the tag `4`. Because memory writes are random, we could overwrite _anything_. Let's say this ends up being the `2` tag, giving us `[0, 1, 4, 3, 4]`. The Unique Tag Variant is broken! Not good! Our only hope is to use a tag which is _not_ already in the set&mdash; say, `5` or `10000`.

##### Problem 2: Retrieving Overwrote Data

Now that we've got a mechanism for dealing with Problem 1, we now have to deal with Problem 2: How do we retrieve the tag and the data which we randomly overwrote?

###### Retrieving the Overwrote Tag

Let's start by retrieving the tag that was overwritten. Since we already have a `read` operation that can find whatever we want, we just need to enumerate over every tag and stop when there's one that we can't find in memory, right? Unfortunately, this won't work. If we try to find a tag a billion times and fail, there's still a vanishingly small chance that&mdash; by sheer dumb luck&mdash; we just so happened to never encounter that tag's memory cell. No matter how much we keep searching, we can _never_ be _totally_ sure that a tag doesn't exist. We can be _almost_ certain, but we can never be _completely_ certain. Compare this to if we're detecting if a tag _does_ exist: Once we find it, we know with _certainty_ that it exists. The main takeaway is that we can always prove that a tag _exists_, but we _can't_ directly prove that a tag _doesn't exist_.

Fortunately, there's a workaround. Let's make our tags be a sequence of consecutive integers&mdash; one with no gaps. For instance, `[3, 2, 1, 4, 5]` and `[7, 5, 2, 3, 4, 6]` would be valid sequences of tags, because they contain every integer between their respective minimums and maximums, but `[1, 2, 6, 5, 4]` _wouldn't_ be a valid list of tags, because `3` is missing. I've made these out-of-order on purpose to illustrate that the actual order in physical memory doesn't matter here&mdash; reading memory with a tag will give you the memory with that tag, whether it's at the _start_ of physical memory or the _end_.

Now that we have a contiguous sequence of tags. For the sake of explanation, we'll assume that they start at `0` and end at `m - 1`. Consider what happens when we do a write: One of these tags is overwritten with a tag not in the set. This _must_ create at least one gap in the list of tags. In fact, if we choose `m` for the _new_ tag, we will create _exactly_ one gap. The fact that there's now a gap might seem like a problem, but we can use it to our advantage to find the tag we overwrote.

Consider the following procedure: We have a sequence of tags in memory with a gap, denoted `gap`. We start with a counter `countup` at `0` and we repeatedly `load` a random memory address (not using our reliable `read` procedure). Every time we find the memory with a tag equal to `countup`, we increment `countup` by 1 and repeat. We logically know that this counter will keep incrementing until `countup = gap` and thus starts trying to find the `gap` tag in memory, at which point it'll enter an infinite loop, leaving us at exactly where we started earlier, since we can' prove that it won't _eventually_ find the `gap` tag. We'll say that it's "stuck" at `gap`. Crucially, it will _never get stuck anywhere else_, because everywhere else, it is guaranteed (probability 1) to _eventually_ find an existing tag and increment itself. To summarize, it is guaranteed to _find the gap_ and _get stuck there_.

What if we also had a counter `countdown` that counts _down_ from `m - 1` following the same logic as `countup`? Whenever it finds a tag equal to `countdown`, it decrements itself and repeats. This will _also_ get stuck at `gap`.

I hope you can see where I'm going with this: By alternating between attempting to increment `countup` and attempting to decrement `countdown`, we can guarantee that both of them will eventually get "stuck" and "meet" each other in the only place they can: directly over `gap`. In this case, `countup = countdown = gap`. We also know that the case of `countup = countdown` _cannot occur_ anywhere else:

- If they met at a tag which is greater than `gap`, then `countup` would have to cross over the gap, which is impossible.
- If they met at a tag which is less than `gap`, then `countdown` would have to cross over the gap, which is also impossible.

Because of this, we can conclude that when `countup = countdown`&mdash; which, with a gap, is guaranteed to happen&mdash; we have found the gap, which is equal to both `countup` and `countdown`.

To recap, we're doing this to find the gap in the otherwise-consecutive sequence of integer tags, a gap which is created immediately after we try to do a write operation with our randomly-writing `store` instruction. This gap is the tag that we overwrote, a tag which we can now remember in a register.

###### Retrieving the Overwrote Data

Retrieving the data bit is a lot simpler. We can start by summing up every single data bit in memory. Using our reliable `read` and the fact that we know that the tags are a consecutive sequence of integers, we can get every memory cell exactly once and sum up their data bits. We have to avoid the "hole" in the tags (if we don't, our `read` will run forever because it'll never find the memory cell), but we can find the hole with our `countup`/`countdown` procedure. The sum of all the data bits in memory is what we'll call a `checksum`.

Whenever we write, we'll first do the `countup`/`countdown` ` procedure and then recalculate the checksum, comparing it to the checksum we found after our last write. Because only one bit changed, the checksums can only differ by at most 1. We make a conclusion depending on what happens:

1. If the checksum _grew larger_, a 0 must have become a 1, and thus we overwrote a **0**.
2. If the checksum _grew smaller_, a 1 must have become a 0, and thus we overwrote a **1**.
3. If the checksum _stayed the same_, nothing must have changed, and thus, whatever we overwrote is the **same as whatever we replaced it with.**

##### Summary of Problem 2 So Far

That was a mouthful. In summary, to fix Problem 2 and retrieve the data we just overwrote, we have to:

1. Retrieve the tag by counting up from the lowest tag and counting down from the highest tag, stopping once both counters meet at the gap, which represents our missing tag.
2. Retrieve the data bit by comparing the sum of all data bits _now_ to how it was before, and using how that sum changed to infer how the data bit we wrote to must have changed.

##### Fixing what we broke

Alright. Now we can write to data while fixing the two problems: We can maintain the Unique Tag Invariant (and thus our ability to `read`) and we can figure out what we overwrote. But how useful is figuring out _what_ we overwrote if we can't do anything about it? Ideally, we should be able to put the thing we broke _back into_ memory, both filling the hole that was created and returning that memory cell's data bit as well. We can easily do this after a write by just writing again, this time to write the overwritten data back to memory. Except by doing this, we'll be overwriting _something else_, effectively kicking the can down the road and taking us back where we started.

But wait, by solving Problem 2, we've gotten the tag and the data bit of a memory cell in our registers, where we can freely read and write to and from both! In a way, this memory we're storing in our registers acts as an _extra_ part of memory. Wait.

##### An Extra Part of Memory

Time for a paradigm shift. Instead of thinking of memory as just the memory cells we can access randomly, let's think of it as the memory cells we can access randomly, _plus_ this one extra register with its _own_ data bit and unique tag, which we'll call the `hole` register, since it represents the hole in memory. Whenever we do a write operation, instead of replacing a memory cell (whose contents we'll call `M`) with _any old_ tag and data bit, let's instead replace it with the tag and data bit from the `hole` register. At this point, the `hole` data is in memory. We then use the `countup`/`countdown` procedure and the `checksum` to retrieve the old contents of `M` that we just overwrote. Now, let's take those contents and put them in the `hole` register. Now, the `hole` data is in memory, and the `M` data is in `hole`. We've just swapped the two. To make it more clear what we've just accomplished, we've found a procedure for _swapping a random memory location with a register_ which crucially doesn't break any of the invariants after it's all over.

And as it turns out, this procedure is exactly what we need to implement proper writes.

#### Problem 3: Choosing what we're writing to.

So now we have a procedure that swaps a register and a memory location. In order to properly `write` to a specific memory location, we need to repeatedly perform this memory-register swap operation until `hole` contains the memory location whose tag matches the tag of the location to which we want to write. Once we have this memory location in the `hole` register, we can set the data bit to whatever we want, swap it, and then we're done.

#### Aside: Fixing Reading

One important thing to note is that now that we've added this `hole` register as a part of "memory", our `read` operation needs to be able to read it as well. This is, fortunately, quite simple: We just check to see if the tag of the address we're reading is equal to the tag of `hole`, and just read from hole if that is the case. Otherwise, we read from memory as normal.

#### Now what?

Now that we have `read` and `write` operations that let us _choose_ which memory we read/write to, this architecture is in theory just as capable as any load-store architecture. Sure, we can only read/write single bits at a time, but devising an algorithm for collecting multiple bits into a larger number and operating on it within registers (and vice/versa for writing) should be easy pickings compared to what we've done so far.

## Limitations

Despite how flexible this system is, it does have a few frustrating limitations.

- First, the elephant in the room: It's laughably slow. Reads are `O(m)` and writes are `O(m^3)`. This is by no means a practical architecture. Though I'm pretty sure you already knew that.
- You can index far less memory than what you'd be able to with the entire address space offered by a given word size, since each word only contains a single bit of actual data and we can only have `2^(w - 1)` unique tags, where `w` is the word size.
- We need a bunch of registers for storing auxiliary data associated with reading and writing, either driving up the mandatory register count or lowering the number of general-purpose registers we can do for other tasks.
