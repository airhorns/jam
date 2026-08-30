// Radix UI color scales (via @tamagui/colors). Each scale is 12 steps from
// background (1) to foreground (12); dark variants are tuned for dark backgrounds.

export type ColorScale = readonly [string, string, string, string, string, string, string, string, string, string, string, string];

export const gray: ColorScale = [
  "#fcfcfc",
  "#f9f9f9",
  "#f0f0f0",
  "#e8e8e8",
  "#e0e0e0",
  "#d9d9d9",
  "#cecece",
  "#bbbbbb",
  "#8d8d8d",
  "#838383",
  "#646464",
  "#202020",
];

export const grayDark: ColorScale = [
  "#111111",
  "#191919",
  "#222222",
  "#2a2a2a",
  "#313131",
  "#3a3a3a",
  "#484848",
  "#606060",
  "#6e6e6e",
  "#7b7b7b",
  "#b4b4b4",
  "#eeeeee",
];

export const blue: ColorScale = [
  "#fbfdff",
  "#f4faff",
  "#e6f4fe",
  "#d5efff",
  "#c2e5ff",
  "#acd8fc",
  "#8ec8f6",
  "#5eb1ef",
  "#0090ff",
  "#0588f0",
  "#0d74ce",
  "#113264",
];

export const blueDark: ColorScale = [
  "#0d1520",
  "#111927",
  "#0d2847",
  "#003362",
  "#004074",
  "#104d87",
  "#205d9e",
  "#2870bd",
  "#0090ff",
  "#3b9eff",
  "#70b8ff",
  "#c2e6ff",
];

export const red: ColorScale = [
  "#fffcfc",
  "#fff7f7",
  "#feebec",
  "#ffdbdc",
  "#ffcdce",
  "#fdbdbe",
  "#f4a9aa",
  "#eb8e90",
  "#e5484d",
  "#dc3e42",
  "#ce2c31",
  "#641723",
];

export const redDark: ColorScale = [
  "#191111",
  "#201314",
  "#3b1219",
  "#500f1c",
  "#611623",
  "#72232d",
  "#8c333a",
  "#b54548",
  "#e5484d",
  "#ec5d5e",
  "#ff9592",
  "#ffd1d9",
];

export const yellow: ColorScale = [
  "#fdfdf9",
  "#fefce9",
  "#fffab8",
  "#fff394",
  "#ffe770",
  "#f3d768",
  "#e4c767",
  "#d5ae39",
  "#ffe629",
  "#ffdc00",
  "#9e6c00",
  "#473b1f",
];

export const yellowDark: ColorScale = [
  "#14120b",
  "#1b180f",
  "#2d2305",
  "#362b00",
  "#433500",
  "#524202",
  "#665417",
  "#836a21",
  "#ffe629",
  "#ffff57",
  "#f5e147",
  "#f6eeb4",
];

export const green: ColorScale = [
  "#fbfefc",
  "#f4fbf6",
  "#e6f6eb",
  "#d6f1df",
  "#c4e8d1",
  "#adddc0",
  "#8eceaa",
  "#5bb98b",
  "#30a46c",
  "#2b9a66",
  "#218358",
  "#193b2d",
];

export const greenDark: ColorScale = [
  "#0e1512",
  "#121b17",
  "#132d21",
  "#113b29",
  "#174933",
  "#20573e",
  "#28684a",
  "#2f7c57",
  "#30a46c",
  "#33b074",
  "#3dd68c",
  "#b1f1cb",
];

export const orange: ColorScale = [
  "#fefcfb",
  "#fff7ed",
  "#ffefd6",
  "#ffdfb5",
  "#ffd19a",
  "#ffc182",
  "#f5ae73",
  "#ec9455",
  "#f76b15",
  "#ef5f00",
  "#cc4e00",
  "#582d1d",
];

export const orangeDark: ColorScale = [
  "#17120e",
  "#1e160f",
  "#331e0b",
  "#462100",
  "#562800",
  "#66350c",
  "#7e451d",
  "#a35829",
  "#f76b15",
  "#ff801f",
  "#ffa057",
  "#ffe0c2",
];

export const pink: ColorScale = [
  "#fffcfe",
  "#fef7fb",
  "#fee9f5",
  "#fbdcef",
  "#f6cee7",
  "#efbfdd",
  "#e7acd0",
  "#dd93c2",
  "#d6409f",
  "#cf3897",
  "#c2298a",
  "#651249",
];

export const pinkDark: ColorScale = [
  "#191117",
  "#21121d",
  "#37172f",
  "#4b143d",
  "#591c47",
  "#692955",
  "#833869",
  "#a84885",
  "#d6409f",
  "#de51a8",
  "#ff8dcc",
  "#fdd1ea",
];

export const purple: ColorScale = [
  "#fefcfe",
  "#fbf7fe",
  "#f7edfe",
  "#f2e2fc",
  "#ead5f9",
  "#e0c4f4",
  "#d1afec",
  "#be93e4",
  "#8e4ec6",
  "#8347b9",
  "#8145b5",
  "#402060",
];

export const purpleDark: ColorScale = [
  "#18111b",
  "#1e1523",
  "#301c3b",
  "#3d224e",
  "#48295c",
  "#54346b",
  "#664282",
  "#8457aa",
  "#8e4ec6",
  "#9a5cd0",
  "#d19dff",
  "#ecd9fa",
];

export const teal: ColorScale = [
  "#fafefd",
  "#f3fbf9",
  "#e0f8f3",
  "#ccf3ea",
  "#b8eae0",
  "#a1ded2",
  "#83cdc1",
  "#53b9ab",
  "#12a594",
  "#0d9b8a",
  "#008573",
  "#0d3d38",
];

export const tealDark: ColorScale = [
  "#0d1514",
  "#111c1b",
  "#0d2d2a",
  "#023b37",
  "#084843",
  "#145750",
  "#1c6961",
  "#207e73",
  "#12a594",
  "#0eb39e",
  "#0bd8b6",
  "#adf0dd",
];

export const slate: ColorScale = [
  "#fcfcfd",
  "#f9f9fb",
  "#f0f0f3",
  "#e8e8ec",
  "#e0e1e6",
  "#d9d9e0",
  "#cdced6",
  "#b9bbc6",
  "#8b8d98",
  "#80838d",
  "#60646c",
  "#1c2024",
];

export const slateDark: ColorScale = [
  "#111113",
  "#18191b",
  "#212225",
  "#272a2d",
  "#2e3135",
  "#363a3f",
  "#43484e",
  "#5a6169",
  "#696e77",
  "#777b84",
  "#b0b4ba",
  "#edeef0",
];

export const violet: ColorScale = [
  "#fdfcfe",
  "#faf8ff",
  "#f4f0fe",
  "#ebe4ff",
  "#e1d9ff",
  "#d4cafe",
  "#c2b5f5",
  "#aa99ec",
  "#6e56cf",
  "#654dc4",
  "#6550b9",
  "#2f265f",
];

export const violetDark: ColorScale = [
  "#14121f",
  "#1b1525",
  "#291f43",
  "#33255b",
  "#3c2e69",
  "#473876",
  "#56468b",
  "#6958ad",
  "#6e56cf",
  "#7d66d9",
  "#baa7ff",
  "#e2ddfe",
];

export const amber: ColorScale = [
  "#fefdfb",
  "#fefbe9",
  "#fff7c2",
  "#ffee9c",
  "#fbe577",
  "#f3d673",
  "#e9c162",
  "#e2a336",
  "#ffc53d",
  "#ffba18",
  "#ab6400",
  "#4f3422",
];

export const amberDark: ColorScale = [
  "#16120c",
  "#1d180f",
  "#302008",
  "#3f2700",
  "#4d3000",
  "#5c3d05",
  "#714f19",
  "#8f6424",
  "#ffc53d",
  "#ffd60a",
  "#ffca16",
  "#ffe7b3",
];

export const cyan: ColorScale = [
  "#fafdfe",
  "#f2fafb",
  "#def7f9",
  "#caf1f6",
  "#b5e9f0",
  "#9ddde7",
  "#7dcedc",
  "#3db9cf",
  "#00a2c7",
  "#0797b9",
  "#107d98",
  "#0d3c48",
];

export const cyanDark: ColorScale = [
  "#0b161a",
  "#101b20",
  "#082c36",
  "#003848",
  "#004558",
  "#045468",
  "#12677e",
  "#11809c",
  "#00a2c7",
  "#23afd0",
  "#4ccce6",
  "#b6ecf7",
];

export const indigo: ColorScale = [
  "#fdfdfe",
  "#f7f9ff",
  "#edf2fe",
  "#e1e9ff",
  "#d2deff",
  "#c1d0ff",
  "#abbdf9",
  "#8da4ef",
  "#3e63dd",
  "#3358d4",
  "#3a5bc7",
  "#1f2d5c",
];

export const indigoDark: ColorScale = [
  "#11131f",
  "#141726",
  "#182449",
  "#1d2e62",
  "#253974",
  "#304384",
  "#3a4f97",
  "#435db1",
  "#3e63dd",
  "#5472e4",
  "#9eb1ff",
  "#d6e1ff",
];

export const crimson: ColorScale = [
  "#fffcfd",
  "#fef7f9",
  "#ffe9f0",
  "#fedce7",
  "#facedd",
  "#f3bed1",
  "#eaacc3",
  "#e093b2",
  "#e93d82",
  "#df3478",
  "#cb1d63",
  "#621639",
];

export const crimsonDark: ColorScale = [
  "#191114",
  "#201318",
  "#381525",
  "#4d122f",
  "#5c1839",
  "#6d2545",
  "#873356",
  "#b0436e",
  "#e93d82",
  "#ee518a",
  "#ff92ad",
  "#fdd3e8",
];

export const tomato: ColorScale = [
  "#fffcfc",
  "#fff8f7",
  "#feebe7",
  "#ffdcd3",
  "#ffcdc2",
  "#fdbdaf",
  "#f5a898",
  "#ec8e7b",
  "#e54d2e",
  "#dd4425",
  "#d13415",
  "#5c271f",
];

export const tomatoDark: ColorScale = [
  "#181111",
  "#1f1513",
  "#391714",
  "#4e1511",
  "#5e1c16",
  "#6e2920",
  "#853a2d",
  "#ac4d39",
  "#e54d2e",
  "#ec6142",
  "#ff977d",
  "#fbd3cb",
];

export const grass: ColorScale = [
  "#fbfefb",
  "#f5fbf5",
  "#e9f6e9",
  "#daf1db",
  "#c9e8ca",
  "#b2ddb5",
  "#94ce9a",
  "#65ba74",
  "#46a758",
  "#3e9b4f",
  "#2a7e3b",
  "#203c25",
];

export const grassDark: ColorScale = [
  "#0e1511",
  "#141a15",
  "#1b2a1e",
  "#1d3a24",
  "#25482d",
  "#2d5736",
  "#366740",
  "#3e7949",
  "#46a758",
  "#53b365",
  "#71d083",
  "#c2f0c2",
];

export const lime: ColorScale = [
  "#fcfdfa",
  "#f8faf3",
  "#eef6d6",
  "#e2f0bd",
  "#d3e7a6",
  "#c2da91",
  "#abc978",
  "#8db654",
  "#bdee63",
  "#b0e64c",
  "#5c7c2f",
  "#37401c",
];

export const limeDark: ColorScale = [
  "#11130c",
  "#151a10",
  "#1f2917",
  "#29371d",
  "#334423",
  "#3d522a",
  "#496231",
  "#577538",
  "#bdee63",
  "#d4ff70",
  "#bde56c",
  "#e3f7ba",
];

export const mint: ColorScale = [
  "#f9fefd",
  "#f2fbf9",
  "#ddf9f2",
  "#c8f4e9",
  "#b3ecde",
  "#9ce0d0",
  "#7ecfbd",
  "#4cbba5",
  "#86ead4",
  "#7de0cb",
  "#027864",
  "#16433c",
];

export const mintDark: ColorScale = [
  "#0e1515",
  "#0f1b1b",
  "#092c2b",
  "#003a38",
  "#004744",
  "#105650",
  "#1e685f",
  "#277f70",
  "#86ead4",
  "#a8f5e5",
  "#58d5ba",
  "#c4f5e1",
];

export const sky: ColorScale = [
  "#f9feff",
  "#f1fafd",
  "#e1f6fd",
  "#d1f0fa",
  "#bee7f5",
  "#a9daed",
  "#8dcae3",
  "#60b3d7",
  "#7ce2fe",
  "#74daf8",
  "#00749e",
  "#1d3e56",
];

export const skyDark: ColorScale = [
  "#0d141f",
  "#111a27",
  "#112840",
  "#113555",
  "#154467",
  "#1b537b",
  "#1f6692",
  "#197cae",
  "#7ce2fe",
  "#a8eeff",
  "#75c7f0",
  "#c2f3ff",
];

