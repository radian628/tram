# TRAM (True Random Access Memory)

**What if dereferencing a pointer always gave you a random memory location?** Could you get _any_ meaningful work done with such a system? This VM I've made attempts to answer that question.

Spoiler: It turns out you _can_.

## Files

`vm.mjs` - A VM for the custom load-store architecture.

`examples.mjs` - An implementation of arbitrary reads/writes, which are then used to implement (very slow) bubble sort.
