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
        },{id: "post-semaphore-vs-mutex",
      
        title: "Semaphore vs. mutex",
      
      description: "",
      section: "Posts",
      handler: () => {
        
          window.location.href = "/blog/2025/Semaphore-vs.-Mutex/";
        
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
