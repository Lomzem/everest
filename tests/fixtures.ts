/** Synthetic fixture. No private reference files are used by browser tests. */
export const registerMap = `enum Mode {
    IDLE = 0;
    RUN = 1;
    SLEEP = 2;
};
addrmap device {
    name = "Device";
    reg {
        field { sw = rw; hw = r; } enable[0:0] = 0;
        field { sw = rw; hw = r; encode = Mode; } mode[2:1] = 0;
    } control @0x0;
    reg {
        field { sw = r; hw = w; } count[15:8] = 0;
    } status @0x4;
};
`;
