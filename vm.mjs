/*
Registers:
- ip - Instruction pointer
- hole - The "hole" that's used for store operations.
- holedata - Data bit for the "hole".
- min - The "minimum value" for write hole detection.
- max - The "maximum value" for write hole detection.
- read - Read destination
- acc - Accumulator
- min2
- max2
- a - General-purpose
- b - General-purpose
- c - General-purpose
- d - General-purpose
- checksum - Checksum of all memory
- checksum2 - Previous checksum
- tmp - Generic temporary value

Instructions (can either take registers or numbers):
- Memory
  - load r1 - Load a random memory address into r1.
  - store op - Store to a random memory address.
- Jumps
  - je r1 r2 label - Jump to label if equal
  - jne r1 r2 label - Jump to label if not equal
	- jmp label - Unconditional jump
	- cmp r1 r2 r3 - Compare r1 and r2, putting result in r3. Returns values based on comparison
    - r1 > r2 - 1
    - r1 = r2 - 0
		- r1 < r2 - -1
	- label name - Stupid label instruction that only exists for ease of implementation
- Math and Bitwise (src src dst)
  - add r1 r2 r3 - Addition
  - sub r1 r2 r3 - Subtraction
	- mul r1 r2 r3 - Multiplication
	- div r1 r2 r3 - Division
  - mod r1 r2 r3 - Modulus
  - or r1 r2 r3 - Bitwise OR
- IO and Lifecycle
	- in r1 - Load a value from input into r1. Halts on no input remaining.
	- out r1 - Push a value from r1 into output.
	- halt - Stop the computation
- Other
	- mov r1 r2 - Move value from r1 to r2.
  - debug - print a debug message
  - printmem - print a snapshot of memory
*/

export function run(code, memorySize, input) {
  const mem = new Array(memorySize).fill(0);

  const output = [];

  const addr = () => Math.floor(Math.random() * mem.length);
  const load = () => mem[addr()];
  const store = (v) => (mem[addr()] = v);

  const registers = {
    hole: 0,
    holedata: 0,
    min: 0,
    max: 0,
    read: 0,
    acc: 0,
    a: 0,
    b: 0,
    c: 0,
    d: 0,
    ip: 0,
    checksum: 0,
    checksum2: 0,
    min2: 0,
    max2: 0,
    tmp: 0,
  };

  // LSB is data bit, everything else is key
  for (let i = 0; i < memorySize; i++) {
    mem[i] = i * 2;
  }

  // missing key
  registers.hole = memorySize;

  const printinstr = () => code[registers.ip]?.join?.(" ");

  const getvalue = (v) => {
    const ret = typeof v === "number" ? v : registers[v];
    if (ret === undefined)
      throw new Error(
        `Error at '${printinstr()}': Could not get value '${v}'.`
      );

    return ret;
  };

  const mov = (dst, v) => {
    if (registers[dst] === undefined)
      throw new Error(
        `Error at '${printinstr()}', Cannot load '${v}' into '${dst}', as '${dst}' does not exist.`
      );

    registers[dst] = v;
  };

  const labelLocations = new Map();

  let i = 0;

  for (const instr of code) {
    i++;
    if (instr[0] !== "label") continue;

    labelLocations.set(instr[1], i - 1);
  }

  const jmp = (label) => {
    const loc = labelLocations.get(label);

    if (loc === undefined)
      throw new Error(
        `Error at '${printinstr()}': Label '${label}' does not exist.`
      );

    registers.ip = loc;
  };

  while (true) {
    const fullInstr = code[registers.ip];

    if (!fullInstr)
      throw new Error(
        `Error: Instruction at ip=${registers.ip} doesn't exist.`
      );

    const [r1, r2, r3] = fullInstr.slice(1);

    const [instr] = fullInstr;

    const returnValue = () => ({
      output,
      mem,
      registers,
    });

    switch (instr) {
      case "load":
        mov(r1, load());
        break;
      case "store":
        store(getvalue(r1));
        break;
      case "je": {
        const [v1, v2] = [getvalue(r1), getvalue(r2)];
        if (v1 === v2) jmp(r3);
        break;
      }
      case "jne": {
        const [v1, v2] = [getvalue(r1), getvalue(r2)];
        if (v1 !== v2) jmp(r3);
        break;
      }
      case "jmp":
        jmp(r1);
        break;
      case "cmp": {
        const [v1, v2] = [getvalue(r1), getvalue(r2)];
        if (v1 > v2) mov(r3, 1);
        if (v1 == v2) mov(r3, 0);
        if (v1 < v2) mov(r3, -1);
        break;
      }
      case "label":
        break;
      case "add":
        mov(r3, getvalue(r1) + getvalue(r2));
        break;
      case "sub":
        mov(r3, getvalue(r1) - getvalue(r2));
        break;
      case "mul":
        mov(r3, getvalue(r1) * getvalue(r2));
        break;
      case "div":
        mov(r3, Math.floor(getvalue(r1) / getvalue(r2)));
        break;
      case "mod":
        mov(r3, getvalue(r1) % getvalue(r2));
        break;
      case "or":
        mov(r3, getvalue(r1) | getvalue(r2));
        break;
      case "in": {
        const v = input.shift();
        if (v === undefined) return returnValue();
        mov(r1, v);
        break;
      }
      case "out":
        output.push(getvalue(r1));
        break;
      case "halt":
        return returnValue();
      case "mov": {
        mov(r2, getvalue(r1));
        break;
      }
      case "debug": {
        console.log(
          "DEBUG: ",
          fullInstr.slice(1).map((v) => {
            try {
              return getvalue(v);
            } catch {
              return v;
            }
          })
        );
        break;
      }
      case "printmem":
        console.log("PRINTMEM: ", mem);
        break;
      default:
        throw new Error(`Error: Unrecognized instruction '${printinstr()}'`);
    }

    registers.ip++;
  }
}
