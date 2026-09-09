/** This example is synthetic and contains no source from user documents. */
export const SAMPLE_RDL = `// Explore this sample, or open your own .rdl file.
property category {
    type = string;
    component = reg | field;
};

enum Mode {
    IDLE = 0;
    RUN = 1;
    SLEEP = 2;
};

addrmap device {
    name = "Device registers";
    desc = "A small register map for a browser-based workflow.";
    default regwidth = 32;

    reg {
        name = "Control";
        desc = "Select the operating mode and enable the device.";
        category = "Configuration";
        field {
            desc = "Enable the device.";
            sw = rw;
            hw = r;
            reset = 0;
        } enable[0:0];
        field {
            desc = "Operating mode.";
            sw = rw;
            hw = r;
            encode = Mode;
            reset = 0;
        } mode[2:1];
    } control @ 0x0;

    reg {
        name = "Status";
        desc = "Current device state.";
        field {
            desc = "The device is ready.";
            sw = r;
            hw = w;
            reset = 1;
        } ready[0:0];
        field {
            desc = "Completed operation count.";
            sw = r;
            hw = w;
            reset = 0;
        } count[15:8];
    } status @ 0x4;
};
`;
export const EMPTY_RDL = `addrmap device {\n    reg {\n        field { sw = rw; hw = r; } value[0:0];\n    } control @ 0x0;\n};\n`;
