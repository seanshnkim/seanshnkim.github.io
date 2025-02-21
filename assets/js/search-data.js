// get the ninja-keys element
const ninja = document.querySelector('ninja-keys');

// add the home and posts menu items
ninja.data = [{
    id: "nav-about",
    title: "about",
    section: "Navigation",
    handler: () => {
      window.location.href = "/";
    },
  },{id: "nav-post",
          title: "post",
          description: "",
          section: "Navigation",
          handler: () => {
            window.location.href = "/post/index.html";
          },
        },{id: "nav-projects",
          title: "projects",
          description: "A collection of side projects.",
          section: "Navigation",
          handler: () => {
            window.location.href = "/projects/";
          },
        },{id: "post-sort-in-python-and-c",
      
        title: "Sort in Python and C++",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/Sort-in-Python-and-CPP/";
        
      },
    },{id: "post-two-pointers",
      
        title: "Two Pointers",
      
      description: "Different approaches to solve two pointer algorithm problems",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/Rotate-Array/";
        
      },
    },{id: "post-two-pointers",
      
        title: "Two Pointers",
      
      description: "Different approaches to solve two pointer algorithm problems",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/Two-Pointers/";
        
      },
    },{id: "post-schedulers",
      
        title: "Schedulers",
      
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
    },{id: "post-mistake-collections",
      
        title: "Mistake Collections",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/Mistakes/";
        
      },
    },{id: "post-array-and-hashing-part-1",
      
        title: "Array and Hashing Part 1",
      
      description: "How to handle array and hash map &amp; set",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/Array-and-Hashing/";
        
      },
    },{id: "post-queue-priority-queue-and-vector-in-c",
      
        title: "Queue, Priority Queue and Vector in C++",
      
      description: "Convenient Cheat Sheet for queue, priority queue and vector methods in vector",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/Queue,-Priority-Queue-and-Vector-in-C++/";
        
      },
    },{id: "post-heap-and-priority-queue-problems",
      
        title: "Heap and Priority Queue Problems",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/Heap-and-Priority-Queue-Problems/";
        
      },
    },{id: "post-bit-manipulation",
      
        title: "Bit Manipulation",
      
      description: "Bit manipulations and useful techniques",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/Bit-Manipulation/";
        
      },
    },{id: "post-tree-and-graph",
      
        title: "Tree and Graph",
      
      description: "Basic concepts on tree and graph",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/tree/";
        
      },
    },{id: "post-bfs-breadth-first-search-and-queue",
      
        title: "BFS (Breadth First Search) and Queue",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/bfs-and-queue/";
        
      },
    },{id: "post-dfs-depth-first-search-and-recursion",
      
        title: "DFS (Depth First Search) and Recursion",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/dfs-and-recursion/";
        
      },
    },{id: "post-list-and-vector-in-python-and-in-c",
      
        title: "List and vector in Python and in C++",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/list-and-vector-in-python-and-in-cpp/";
        
      },
    },{id: "post-hash-map-and-set-in-python-and-in-c",
      
        title: "Hash map and set in Python and in C++",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/hash-map-and-set-in-python-and-in-cpp/";
        
      },
    },{id: "post-priority-queue-in-python-and-in-cpp",
      
        title: "Priority Queue in Python and in CPP",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2024/priority-queue-in-python-and-in-cpp/";
        
      },
    },{id: "news-began-the-first-semester-at-nyu-tandon-school-of-engineering",
          title: 'Began the first semester at NYU Tandon School of Engineering.',
          description: "",
          section: "News",},{id: "news-made-final-round-to-contech-alliannce-hackathon",
          title: 'Made final round to Contech Alliannce Hackathon!',
          description: "",
          section: "News",handler: () => {
              window.location.href = "/news/announcement_2/";
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
      },{
      id: 'light-theme',
      title: 'Change theme to light',
      description: 'Change the theme of the site to Light',
      section: 'Theme',
      handler: () => {
        setThemeSetting("light");
      },
    },
    {
      id: 'dark-theme',
      title: 'Change theme to dark',
      description: 'Change the theme of the site to Dark',
      section: 'Theme',
      handler: () => {
        setThemeSetting("dark");
      },
    },
    {
      id: 'system-theme',
      title: 'Use system default theme',
      description: 'Change the theme of the site to System Default',
      section: 'Theme',
      handler: () => {
        setThemeSetting("system");
      },
    },];
