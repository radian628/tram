import { run } from "./vm.mjs";

function parse(str) {
  return (
    str
      // remove comments
      .replace(/;.*[\r\n]/g, "\n")

      // remove leading and trailing whitespace
      .replace(/^\s+/g, "")
      .replace(/\s+$/g, "")

      // deduplicate newlines to remove extra empty instrs
      // also remove leading/trailing whitespace on lines
      .replace(/\s*[\r\n]+\s*/g, "\n")

      // split instructions
      .split("\n")

      .map((i) =>
        i
          // normalize whitespace
          .replace(/\s+/g, " ")
          // split operands
          .split(" ")

          // convert numeric literals to actual numbers
          .map((i) => (isNaN(Number(i)) ? i : Number(i)))
      )
  );
}

function runTest(label, src, memsize, input) {
  const code = parse(src);
  console.log("Running Test: ", label);
  console.log("  Memory: ", memsize);
  console.log("  Input: ", input);
  const output = run(code, memsize, input);
  console.log("  Stdout: ", output.output);
  console.log("  Memory: ", output.mem);
  console.log("  Registers: ", output.registers);
  console.log("\n");
}

runTest(
  "Five random memory locations",
  `
load a
out a
load a
out a
load a
out a
load a
out a
load a
out a
halt
`,
  4,
  []
);

runTest(
  "Filter less than 10",
  `
; loop as long as input exists
label loop

  ; automatically halts if no input
  in a
  
  ; 10 > a (a less than or equal to 10) --> jump to beginning (no output)
  cmp 10 a b
  je b 1 loop
  out a
  jmp loop
`,
  4,
  [3, 20, 5, 8, 1, 10, 15, 32, 129, 5]
);

let labelDiscrim = 0;
const DUMB_READ = (addr, dst) => {
  const readloop = "readloop" + labelDiscrim++;
  const exitread = "exitread" + labelDiscrim++;
  return `
label ${readloop}
  load read
  mov read ${dst}
  div ${dst} 2 ${dst}
  cmp ${dst} ${addr} ${dst}
  je ${dst} 0 ${exitread}
  jmp ${readloop}
label ${exitread}
  mov read ${dst}
  `;
};

const READ = (addr, dst) => {
  const readskip = "readskip" + labelDiscrim++;
  const usehole = "usehole" + labelDiscrim++;

  return `
  ; dont try to read from memory if it's in the hole
  je ${addr} hole ${usehole}

  ${DUMB_READ(addr, dst)}
  jmp ${readskip}
label ${usehole}

  ; retrieve data directly from memory hole
  mov 0 ${dst}
  add ${dst} hole ${dst}
  mul ${dst} 2 ${dst}
  add ${dst} holedata ${dst}

label ${readskip}
  `;
};

// write to random tag while maintaining unique tag invariant
const WRITE_RANDOM_BIT = (src, totalmem) => {
  const findMissingTagLoop = "findMissingTagLoop" + labelDiscrim++;
  const afterMissingTagLoop = "afterMissingTagLoop" + labelDiscrim++;
  const updateMin = "updateMin" + labelDiscrim++;
  const updateMax = "updateMax" + labelDiscrim++;

  const checksumGreater = "checksumGreater" + labelDiscrim++;
  const checksumLesser = "checksumLesser" + labelDiscrim++;
  const checksumEqual = "checksumEqual" + labelDiscrim++;
  const checksumSkip = "checksumSkip" + labelDiscrim++;

  return `
  ; use the read register to store value to write (kinda ironic lmao)
  ; precondition: this must be 0 or 1
  mov ${src} read

  ; add missing tag to read register so we can directly store it
  mul hole 2 hole
  add read hole read

  ; reset tag hole register
  div hole 2 hole

  ; the actual store operation
  store read

  mov ${totalmem} max
  mov 0 min

  ; now we need to loop to find the missing tag
label ${findMissingTagLoop}

  ; if min = max, we've found the hole
  cmp min max hole
  je hole 0 ${afterMissingTagLoop}

  ; try to update min
  load hole
  div hole 2 hole ; extract tag
  cmp hole min hole
  je hole 0 ${updateMin}

  ; try to update max
  load hole
  div hole 2 hole ; extract tag
  cmp hole max hole
  je hole 0 ${updateMax}

  jmp ${findMissingTagLoop}

  ; increment min
label ${updateMin}
  add min 1 min
  jmp ${findMissingTagLoop}

  ; decrement max
label ${updateMax}
  sub max 1 max
  jmp ${findMissingTagLoop}

  ; min = max = new hole
label ${afterMissingTagLoop}
  
  ; invariant maintained!
  mov min hole 

  ; calculate checksum
  ${CHECKSUM(totalmem)}

  cmp checksum checksum2 min

  je min 1 ${checksumGreater}
  je min 0 ${checksumEqual}
  je min -1 ${checksumLesser}
  jmp ${checksumSkip}

  ; if the new checksum is greater, a 0 changed to a 1
label ${checksumGreater}
  mov 0 holedata
  jmp ${checksumSkip}

  ; if the new checksum is lesser, a 1 changed to a 0
label ${checksumLesser}
  mov 1 holedata
  jmp ${checksumSkip}

label ${checksumEqual}
  mov ${src} holedata

label ${checksumSkip}
  `;
};

const CHECKSUM = (totalmem) => {
  const checksumLoop = "checksumLoop" + labelDiscrim++;
  const skipHole = "skipHole" + labelDiscrim++;

  return `
  ; back up checksum
  mov checksum checksum2

  ; reset checksum so we can recalc it
  mov 0 checksum
  ; reuse min as a loop counter
  ; reuse max as a read destination
  mov 0 min
label ${checksumLoop}

  ; do not try to read the hole (infinite loop)
  je min hole ${skipHole}

  ${DUMB_READ("min", "max")}

  ; get data bit and add to checksum
  mod max 2 max
  add checksum max checksum

label ${skipHole}
  ; as long as min < totalmem, keep looping
  cmp min ${totalmem} read
  add min 1 min
  je read -1 ${checksumLoop}
  `;
};

const WRITE = (src, dst, totalmem) => {
  const writeLoop = "writeLoop" + labelDiscrim++;
  const afterWriteLoop = "afterWriteLoop" + labelDiscrim++;

  return `
label ${writeLoop}
  je hole ${dst} ${afterWriteLoop}
  ${WRITE_RANDOM_BIT("holedata", totalmem)}
  jmp ${writeLoop}

label ${afterWriteLoop}
  ${WRITE_RANDOM_BIT(src, totalmem)}
  `;
};

runTest(
  "Read from 5th word (index 4 when zero-indexed) (should output '8')",
  `
${DUMB_READ(4, "a")}
  out a
  halt
  `,
  8,
  []
);

runTest(
  "Set a random bit to 1 a number of times equal to the 1st value in the input",
  `
  in a
label loop

  ${WRITE_RANDOM_BIT(1, 8)}

  ; loop counting
  sub a 1 a
  cmp a 0 b
  je b 1 loop
  halt
  `,
  8,
  [5]
);

runTest(
  "Set the bits to 1 whose tags are in the input",
  `
label loop
  in a
  ${WRITE(1, "a", 8)}
  jmp loop`,
  8,
  [0, 2, 4, 6]
);

// read bits backwards
const READ_BITS = (offset, limit, dst) => {
  const readbitsLoop = "readbitsLoop" + labelDiscrim++;

  return `
  mov 0 ${dst}

  ; min and max are used as tag iterators
  mov ${offset} min 
  mov ${offset} max 
  add max ${limit} max

  ; load in bits
label ${readbitsLoop}
  sub max 1 max

  ; use acc to store read bit 
  ${READ("max", "acc")}
  mod acc 2 acc

  ; add it as current LSB
  add acc ${dst} ${dst}

  ; bitshift to leave LSB for next bit
  mul ${dst} 2 ${dst}

  cmp min max read
  je read -1 ${readbitsLoop}

  ; divide dst by 2 to fix off-by-one error
  div ${dst} 2 ${dst}

  `;
};

runTest(
  "Write and then read an 8-bit number (132)",
  `
  ${WRITE(0, 0, 16)}
  ${WRITE(0, 1, 16)}
  ${WRITE(1, 2, 16)}
  ${WRITE(0, 3, 16)}
  ${WRITE(0, 4, 16)}
  ${WRITE(0, 5, 16)}
  ${WRITE(0, 6, 16)}
  ${WRITE(1, 7, 16)}
  ${READ_BITS(0, 8, "a")}
  out a
  halt`,
  16,
  []
);

const WRITE_BITS = (src, offset, limit, totalmem) => {
  const writebitsLoop = "writebitsLoop" + labelDiscrim++;

  return `
  ; min and max are used as tag iterators
  mov ${offset} min2 
  mov ${offset} max2 
  add max2 ${limit} max2

  mov ${src} acc 

  ; load in bits
label ${writebitsLoop}

  mod acc 2 tmp

  ; write bit
  ${WRITE("tmp", "min2", totalmem)}
  
  add min2 1 min2

  ; divide by 2 to get next bit in 1s place
  div acc 2 acc

  cmp min2 max2 read
  je read -1 ${writebitsLoop}
  `;
};

runTest(
  "Same as before, but use both byte-based instructions and have a 4-bit offset ",
  `
  in a
  ${WRITE_BITS("a", 4, 8, 16)}
  ${READ_BITS(4, 8, "b")}
  out b
  halt`,
  16,
  [132]
);

const bytes = 8;

runTest(
  "Bubble sort lmao",
  `
  mov ${bytes} c 
label getInputLoop
  in a
  sub c 1 c
  
  mov c b
  mul b 8 b
  ${WRITE_BITS("a", "b", 8, bytes * 8)}

  jne c 0 getInputLoop

  mov ${bytes} c
  mul c 8 c

label outerLoop
  mov ${bytes} d
  mul d 8 d
  sub c 8 c
label innerLoop
  sub d 8 d

  ; swap elements if out of order
  ${READ_BITS("c", 8, "a")}
  ${READ_BITS("d", 8, "b")}
  debug comparing a b
  cmp a b read
  je read 1 skipSwap

  ${WRITE_BITS("a", "d", 8, bytes * 8)}
  ${WRITE_BITS("b", "c", 8, bytes * 8)}

label skipSwap

  jne d 0 innerLoop
  jne c 0 outerLoop

  mov ${bytes} c
label getOutputLoop
  sub c 1 c
  
  mov c b
  mul b 8 b
  ${READ_BITS("b", 8, "a")}

  out a

  jne c 0 getOutputLoop
  halt
`,
  bytes * 8,
  [5, 199, 24, 64, 4, 2, 3, 1]
);
