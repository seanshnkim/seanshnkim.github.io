---
layout: post
title: Set Your Own Title
date: 2025-xx-xx 00:00:00
description:
tags:
categories: TIL
---

## Start

Sample paragraph.

## Image

- Manually setting image size in pixels:

```
{% include figure.liquid loading="eager" path="/assets/post-attachments/img1.png" class="img-fluid rounded z-depth-1" width="250px"%}
```

- To display multiple images in parallel:

```
<div class="image-row" markdown="1">
{% include figure.liquid loading="eager" path="/assets/post-attachments/2025-11-07-img1.png" class="img-fluid rounded z-depth-1" width="250px" %}[^3]

{% include figure.liquid loading="eager" path="/assets/post-attachments/2025-11-07-img2.png" class="img-fluid rounded z-depth-1" width="250px" %}[^4]
</div>
```

- Instead of setting image size manually, you can also use a helper (custom) defined in `_base.scss`:

```
{% include figure.liquid
   loading="eager"
   path="/assets/post-attachments/2025-11-07-img1.png"
   class="img-fluid rounded z-depth-1 figure-lines"
   %}<br>
<!-- to override default lines/line-height, set style on the figure or parent -->
```

- Or, if you want to set the number of lines explicitly per image (recommended):

```
<figure class="figure-lines" style="--figure-lines:5; --figure-line-height:1.2" markdown="1">
  {% include figure.liquid loading="eager" path="/assets/post-attachments/2025-11-07-img1.png" class="img-fluid rounded z-depth-1" %}
</figure>
```

- Using inside your existing .image-row (two images side-by-side):

```
<div class="image-row" markdown="1">
  <figure class="figure-lines" style="--figure-lines:8">
    {% include figure.liquid loading="eager" path="/assets/post-attachments/2025-11-07-img1.png" class="img-fluid rounded z-depth-1" %}
  </figure>

  <figure class="figure-lines" style="--figure-lines:8">
    {% include figure.liquid loading="eager" path="/assets/post-attachments/2025-11-07-img2.png" class="img-fluid rounded z-depth-1" %}
  </figure>
</div>
```

```
<div class="image-row" markdown="1">
  {% include figure.liquid
     loading="eager"
     path="/assets/post-attachments/2025-11-07-img1.png"
     class="img-fluid rounded z-depth-1"
     figure_class="figure-lines"
     figure_style="--figure-lines:8"
     caption="LAN8742A-CZ-TR"
  %}

  {% include figure.liquid
     loading="eager"
     path="/assets/post-attachments/2025-11-07-img2.png"
     class="img-fluid rounded z-depth-1"
     figure_class="figure-lines"
     figure_style="--figure-lines:8"
     caption="RJ45 connector (example)"
  %}
</div>
```

## References

[^1]: https://freertos.org/Documentation/04-Roadmap-and-release-note/02-Release-notes/00-Release-history#changes-between-freertos-v1062-and-freertos-v1100-released-december-18-2023

[^2]: https://arm-software.github.io/CMSIS_5/Core/html/index.html

[^3]: https://www.freertos.org/Documentation/02-Kernel/03-Supported-devices/02-Customization#:~:text=processor%20include%20path.-,FreeRTOSConfig.,RTOS%20kernel%20source%20code%20directories.

[^4]: https://stackoverflow.com/questions/17572519/what-do-the-cc-arm-iccarm-gnuc-and-tasking-macros-mean
