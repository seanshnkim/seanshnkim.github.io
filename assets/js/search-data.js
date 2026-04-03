// get the ninja-keys element
const ninja = document.querySelector('ninja-keys');

// add the home and posts menu items
ninja.data = [{
    id: "nav-",
    title: "",
    section: "Navigation",
    handler: () => {
      window.location.href = "/";
    },
  },{id: "nav-post",
          title: "Post",
          description: "",
          section: "Navigation",
          handler: () => {
            window.location.href = "/index.html";
          },
        },{id: "nav-projects",
          title: "Projects",
          description: "A collection of side projects.",
          section: "Navigation",
          handler: () => {
            window.location.href = "/projects/";
          },
        },{id: "post-uart-bare-metal-driver-phase-2-implementing-isr",
      
        title: "UART Bare-Metal Driver Phase 2: Implementing ISR",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2026/UART-Baremetal-Driver-Phase2/";
        
      },
    },{id: "post-uart-bare-metal-driver-phase-1-clock-init-and-gpio-configuration",
      
        title: "UART Bare-Metal Driver Phase 1: Clock Init and GPIO Configuration",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2026/UART-Baremetal-Driver-Phase1/";
        
      },
    },{id: "post-uart-bare-metal-driver-project-overview",
      
        title: "UART Bare-Metal Driver Project Overview",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2026/UART-Baremetal-Driver-Overview/";
        
      },
    },{id: "post-bootloader-with-ota-phase-5-part-2-ota-handler-implementation",
      
        title: "Bootloader with OTA Phase 5 - Part 2: OTA Handler Implementation",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2026/Dual-Bank-Bootloader-OTA-Phase5-Part2/";
        
      },
    },{id: "post-bootloader-with-ota-phase-5-ota-protocol-implementation-part-1",
      
        title: "Bootloader with OTA Phase 5: OTA Protocol Implementation - Part 1",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2026/Dual-Bank-Bootloader-OTA-Phase5-Part1/";
        
      },
    },{id: "post-bootloader-with-ota-phase-4-1-debugging-the-crc-mismatch",
      
        title: "Bootloader with OTA Phase 4.1: Debugging the CRC Mismatch",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2026/Dual-Bank-Bootloader-OTA-Phase4.1/";
        
      },
    },{id: "post-bootloader-with-ota-phase-4-implementing-persistent-boot-state",
      
        title: "Bootloader with OTA Phase 4: Implementing Persistent Boot State",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2026/Dual-Bank-Bootloader-OTA-Phase4/";
        
      },
    },{id: "post-bootloader-with-ota-phase-3-dual-bank-selection",
      
        title: "Bootloader with OTA Phase 3: Dual Bank Selection",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2026/Dual-Bank-Bootloader-OTA-Phase3/";
        
      },
    },{id: "post-debugging-bootloader-part-2",
      
        title: "Debugging Bootloader: Part 2",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2026/Debugging-Bootloader-Part2/";
        
      },
    },{id: "post-debugging-bootloader-part-1",
      
        title: "Debugging Bootloader: Part 1",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2026/Debugging-Bootloader-Part1/";
        
      },
    },{id: "post-bootloader-with-ota-phase-2-minimal-bootloader",
      
        title: "Bootloader with OTA Phase 2: Minimal Bootloader",
      
      description: "What does it look like?",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2026/Dual-Bank-Bootloader-OTA-Phase2/";
        
      },
    },{id: "post-bootloader-with-ota-phase-1-flash-operations",
      
        title: "Bootloader with OTA Phase 1: Flash Operations",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2026/Dual-Bank-Bootloader-OTA-Phase1/";
        
      },
    },{id: "post-building-my-first-firmware-project-with-claude",
      
        title: "Building My First Firmware Project with Claude",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2026/Dual-Bank-Bootloader-Intro/";
        
      },
    },{id: "post-basic-keywords-for-developing-a-linux-device-driver",
      
        title: "Basic Keywords for Developing a Linux Device Driver",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/TIL-Basic-Keywords-Device-Driver/";
        
      },
    },{id: "post-fork-vs-clone-what-is-the-difference",
      
        title: "fork() vs. clone(): What is the difference?",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/fork-and-clone/";
        
      },
    },{id: "post-external-clock-will-not-work-unless-you-have-a-external-hardware",
      
        title: "External Clock Will Not Work Unless You Have A External Hardware",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/TIL-external-clock-will-not-work/";
        
      },
    },{id: "post-clock-sources-and-types-in-stm32",
      
        title: "Clock Sources and Types in STM32",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/TIL-Real-Time-Clock-2/";
        
      },
    },{id: "post-real-time-clock-in-stm32",
      
        title: "Real Time Clock in STM32",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/TIL-Real-Time-Clock/";
        
      },
    },{id: "post-what-is-mqtt",
      
        title: "What is MQTT?",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/TIL-MQTT-1/";
        
      },
    },{id: "post-what-is-fpu-and-why-does-it-cause-assembler-error",
      
        title: "What is FPU and why does it cause assembler error?",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/TIL-FPU/";
        
      },
    },{id: "post-lightweight-ip-lwip",
      
        title: "LightWeight IP (lwIP)",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/TIL-Lightweight-IP/";
        
      },
    },{id: "post-why-does-it-display-white-screen-after-removing-systick-handler",
      
        title: "Why does it display white screen after removing SysTick_Handler?",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/SysTick_Handler/";
        
      },
    },{id: "post-how-does-platformio-project-work",
      
        title: "How does PlatformIO Project Work?",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/PlatformIO-What-it-does/";
        
      },
    },{id: "post-part-1-how-to-set-freertos-in-your-project",
      
        title: "Part 1. How to Set FreeRTOS in Your Project",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/Setting-FreeRTOS/";
        
      },
    },{id: "post-how-to-use-segger-trace-tool-for-debugging",
      
        title: "How to Use SEGGER Trace Tool for Debugging",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/SEGGER-Trace-Tool/";
        
      },
    },{id: "post-context-switching-in-rtos",
      
        title: "Context Switching in RTOS",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/Context-Switching/";
        
      },
    },{id: "post-schedulers-in-freertos",
      
        title: "Schedulers in FreeRTOS",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/Schedulers/";
        
      },
    },{id: "post-semaphore-vs-mutex",
      
        title: "Semaphore vs. Mutex",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/Semaphore-versus-Mutex/";
        
      },
    },{id: "post-solutions-for-priority-inversion",
      
        title: "Solutions for Priority Inversion",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/Solutions-for-Priority-Inversion-Priority-Ceiling-vs.-Priority-Inheritance/";
        
      },
    },{id: "post-illustrated-priority-inversion",
      
        title: "Illustrated Priority Inversion",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/Illustrated-Priority-Inversion/";
        
      },
    },{id: "post-analysis-on-39-third-maximum-number-39-problem-in-depth",
      
        title: "Analysis on &#39;Third Maximum Number&#39; Problem in Depth",
      
      description: "How to improve code efficiency",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/Third-Maximum-Number/";
        
      },
    },{id: "projects-building-my-first-firmware-project-with-claude",
          title: 'Building My First Firmware Project with Claude',
          description: "",
          section: "Projects",handler: () => {
              window.location.href = "/projects/Dual-Bank-Bootloader-Intro/";
            },},{id: "projects-bootloader-with-ota-phase-1-flash-operations",
          title: 'Bootloader with OTA Phase 1: Flash Operations',
          description: "",
          section: "Projects",handler: () => {
              window.location.href = "/projects/Dual-Bank-Bootloader-OTA-Phase1/";
            },},{id: "projects-bootloader-with-ota-phase-2-minimal-bootloader",
          title: 'Bootloader with OTA Phase 2: Minimal Bootloader',
          description: "",
          section: "Projects",handler: () => {
              window.location.href = "/projects/Dual-Bank-Bootloader-OTA-Phase2/";
            },},{id: "projects-debugging-bootloader-part-1",
          title: 'Debugging Bootloader: Part 1',
          description: "",
          section: "Projects",handler: () => {
              window.location.href = "/projects/Debugging-Bootloader-Part1/";
            },},{id: "projects-debugging-bootloader-part-2",
          title: 'Debugging Bootloader: Part 2',
          description: "",
          section: "Projects",handler: () => {
              window.location.href = "/projects/Debugging-Bootloader-Part2/";
            },},{id: "projects-bootloader-with-ota-phase-3-dual-bank-selection",
          title: 'Bootloader with OTA Phase 3: Dual Bank Selection',
          description: "",
          section: "Projects",handler: () => {
              window.location.href = "/projects/Dual-Bank-Bootloader-OTA-Phase3/";
            },},{id: "projects-bootloader-with-ota-phase-4-implementing-persistent-boot-state",
          title: 'Bootloader with OTA Phase 4: Implementing Persistent Boot State',
          description: "",
          section: "Projects",handler: () => {
              window.location.href = "/projects/Dual-Bank-Bootloader-OTA-Phase4/";
            },},{id: "projects-bootloader-with-ota-phase-4-1-debugging-the-crc-mismatch",
          title: 'Bootloader with OTA Phase 4.1: Debugging the CRC Mismatch',
          description: "",
          section: "Projects",handler: () => {
              window.location.href = "/projects/Dual-Bank-Bootloader-OTA-Phase4.1/";
            },},{id: "projects-bootloader-with-ota-phase-5-ota-protocol-implementation-part-1",
          title: 'Bootloader with OTA Phase 5: OTA Protocol Implementation - Part 1',
          description: "",
          section: "Projects",handler: () => {
              window.location.href = "/projects/Dual-Bank-Bootloader-OTA-Phase5-Part1/";
            },},{id: "projects-bootloader-with-ota-phase-5-part-2-ota-handler-implementation",
          title: 'Bootloader with OTA Phase 5 - Part 2: OTA Handler Implementation',
          description: "",
          section: "Projects",handler: () => {
              window.location.href = "/projects/Dual-Bank-Bootloader-OTA-Phase5-Part2/";
            },},{
        id: 'social-email',
        title: 'email',
        section: 'Socials',
        handler: () => {
          window.open("mailto:%73%65%68%79%75%6E.%73%65%61%6E%6B%69%6D@%67%6D%61%69%6C.%63%6F%6D", "_blank");
        },
      },{
        id: 'social-github',
        title: 'GitHub',
        section: 'Socials',
        handler: () => {
          window.open("https://github.com/seanshnkim", "_blank");
        },
      },{
        id: 'social-linkedin',
        title: 'LinkedIn',
        section: 'Socials',
        handler: () => {
          window.open("https://www.linkedin.com/in/sean-shn-kim", "_blank");
        },
      },{
        id: 'social-rss',
        title: 'RSS Feed',
        section: 'Socials',
        handler: () => {
          window.open("/feed.xml", "_blank");
        },
      },];
