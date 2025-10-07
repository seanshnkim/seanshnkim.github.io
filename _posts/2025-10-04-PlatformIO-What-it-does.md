---
layout: post
title: How does PlatformIO Project Work?
date: 2025-10-04 21:49:02
description:
tags:
categories:
---

## How to Create a PlatformIO Project

In VS Code, I'll assume that PlatformIO extension has been already installed. I'll choose STM32F429I Discovery Kit for board type. The framework and the board type will depend on which type of microcontroller you'd use.

1. Select Board: ST 32F429IDISCOVERY
2. Framework: STM32Cube

PlatformIO will then automatically create folders and files.
In the current workspace:

```bash
// Folders and files created in a new PlatformIO project
.
├── .gitignore
├── .pio
│   └── build
│       ├── disco_f407vg
│       │   └── idedata.json
│       └── project.checksum
├── .vscode
│   ├── c_cpp_properties.json
│   ├── extensions.json
│   └── launch.json
├── include
│   └── README
├── lib
│   └── README
├── platformio.ini
├── src
└── test
    └── README
```

Run this command. It lists file size existing in current directory and sort them from the largest:

```bash
find . -type f -exec du -h {} + | sort -hr
```

The result:

```bash
 20K    ./.vscode/c_cpp_properties.json
 16K    ./.pio/build/disco_f407vg/idedata.json
4.0K    ./test/README
4.0K    ./platformio.ini
4.0K    ./lib/README
4.0K    ./include/README
4.0K    ./.vscode/launch.json
4.0K    ./.vscode/extensions.json
4.0K    ./.pio/build/project.checksum
4.0K    ./.gitignore
```

Note that 1) `c_cpp_properties.json` and 2) `disco_f407vg/idedata.json` have the biggest file size. I couldn't find out what exactly `idedata.json` does. Yet both files seem to contain important information about build and compile process.

### platformio.ini, project config file for modification

Every time you want to change project settings (for example, changing board type or using different framework or RTOS), you do not need to update the json files by yourself. Instead, platformio.ini takes care of all the heavy lifting.

For example, if I change environment and board settings in `platformio.ini`:

```json
[env:disco_f407vg]
platform = ststm32
board = disco_f407vg
framework = stm32cube
```

to:

```json
[env:disco_f429zi]
platform = ststm32
board = disco_f429zi
framework = stm32cube
```

As you save it, you will see PlatformIO automatically updating the contents of files in `.pio/build` and `.vscode` folder including `c_cpp_properties.json` and `disco_f407vg/idedata.json`.

There is no need for an user to change files in `.pio` folder directly. Use `platformio.ini` only.

This is the official tutorial on how to use platformio.ini: https://docs.platformio.org/en/latest/projectconf/index.html

---

## Simple Demo: Printing Text on LCD

Now let's wrap it up with a simple demo project: https://github.com/seanshnkim/Simple-Print-LCD

You can:

1. git clone the repository
2. Wait for PlatformIO to identify the `platformio.ini` file and create configuration files
3. Build and upload the project onto your board

What are custom files other than PlatformIO-created default files?
Except `main.h` and `main.c` source code, there is `stm32f4xx_it.h` and `stm32f4xx_it.c`. What happens if you take them out?

It returns no error, but you won't see any text on LCD (only white blank screen).
We'll see why in the next post.
