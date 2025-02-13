# Welcome to Sean's Tech Blog!

Starting the blog on January 2025, I will mainly discuss my side projects and learned materials on various topics such as embedded systems, IoT, robotics and AI.

---

# How to customize al-folio's blog template

## Table of Contents

- [[#1. Before commit and push, don't forget to run prettier|1. Before commit and push, don't forget to run prettier]]
- [[#2. How to run demo in local|2. How to run demo in local]]
- [[#3. Images embedded in blog post|3. Images embedded in blog post]]
- [[#4. Blog post template rules|4. Blog post template rules]]

This blog was forked from [alshedivat/al-folio](https://github.com/alshedivat/al-folio). Although the blog template already looks awesome, some people might want to customize its settings to their own taste. Without nearly no background in front-end development, I struggled days and days debugging and finding solutions. Here is what I have gone through, and if it is helpful for you please don't hesitate to start this repository!

## 1. Before commit and push, don't forget to run prettier

This is already mentioned in [FAQ.md](https://github.com/alshedivat/al-folio/blob/main/FAQ.md). However, I would like to emphasize once again.
Before commiting and pushing changes into remote repository every time, make sure to run `npx prettier . --write`. Otherwise you will encounter `prettier code formatter workflow run failed for main branch` and you would have to run the workflow again.

## 2. How to run demo in local

Triggering deployment actions for every step you change is bad idea. Not only it takes a long time but is also heavy workload for servers. Instead, we can run tests in local machine for minor changes. Deployment should be performed in final step.

To test updated website, the entire repository of one's own blog in the newest state should be already saved in local machine.

Run the following commands in local terminal. Make sure current working directory is right under `username.github.io` repository (i.e. run `pwd` in terminal, and it should output `~/where-it-is-saved/github-user-name.github.io/`).

```bash
gem install bundler jekyll
bundle install
bundle exec jekyll serve
```

After a few seconds, it will output the following message:

```bash
 Auto-regeneration: enabled for '/Users/username/where-it-is-saved/github-user-name.github.io'
    Server address: http://127.0.0.1:4000
  Server running... press ctrl-c to stop.
```

Type `http://127.0.0.1:4000` in any browser on local machine, and you will see the website.

## 3. Images embedded in blog post

Images **MUST** be saved in `assets` folder. I tried saving the image files in other folder and tried to fix config.yml or deploy.yml but I didn't work. It has to do something with Jekyll build process.

```css
{% include figure.liquid loading="eager" path="assets/post-attachments/single_thread1.png" class="img-fluid rounded z-depth-1" width="500px" %}
```

With width parameter, you can adjust its width and height.

## 4. Blog post template rules

If blog post is shown in plain font and no front-end design added at all, it means that you did not follow correct template rule for blog post. On the top of the content, yml config needs to be added (starting and ending with --- ) and file name needs to be 'YYYY-MM-DD-title.md'.
