---
layout: default
permalink: /blog/
title: Posts
nav: true
nav_order: 2
pagination:
  enabled: true
  collection: posts
  permalink: /page/:num/
  per_page: 10
  sort_field: date
  sort_reverse: true
  trail:
    before: 1 # The number of links before the current page
    after: 3 # The number of links after the current page
---

<div class="post">

{% assign blog_name_size = site.blog_name | size %}
{% assign blog_description_size = site.blog_description | size %}

<!-- Full-width layout with hover sidebar -->
<div class="blog-container">
  <div class="blog-main-content">

    <!-- Featured section: 1 large card + 3 small cards (first page only) -->
    {% if paginator.page == 1 or paginator.page == nil %}
      {% include featured_posts.liquid %}
    {% endif %}

  <ul class="post-list">

    {% if page.pagination.enabled %}
      {% if paginator.page == 1 %}
        {% assign postlist = paginator.posts | slice: 4, 100 %}
      {% else %}
        {% assign postlist = paginator.posts %}
      {% endif %}
    {% else %}
      {% assign postlist = site.posts | slice: 4, 100 %}
    {% endif %}

    {% for post in postlist %}

    {% if post.external_source == blank %}
      {% assign read_time = post.content | number_of_words | divided_by: 180 | plus: 1 %}
    {% else %}
      {% assign read_time = post.feed_content | strip_html | number_of_words | divided_by: 180 | plus: 1 %}
    {% endif %}
    {% assign year = post.date | date: "%Y" %}
    {% assign tags = post.tags | join: "" %}
    {% assign categories = post.categories | join: "" %}

  <li data-post-url="{{ post.url | relative_url }}">

{% if post.thumbnail %}

<div class="row">
          <div class="col-sm-9">
{% endif %}
        <h3>
        {% if post.redirect == blank %}
          <a class="post-title" href="{{ post.url | relative_url }}">{{ post.title }}</a>
        {% elsif post.redirect contains '://' %}
          <a class="post-title" href="{{ post.redirect }}" target="_blank">{{ post.title }}</a>
          <svg width="2rem" height="2rem" viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg">
            <path d="M17 13.5v6H5v-12h6m3-3h6v6m0-6-9 9" class="icon_svg-stroke" stroke="#999" stroke-width="1.5" fill="none" fill-rule="evenodd" stroke-linecap="round" stroke-linejoin="round"></path>
          </svg>
        {% else %}
          <a class="post-title" href="{{ post.redirect | relative_url }}">{{ post.title }}</a>
        {% endif %}
      </h3>
      <p>{{ post.description }}</p>
      <p class="post-meta">
        {{ read_time }} min read &nbsp; &middot; &nbsp;
        {{ post.date | date: '%B %d, %Y' }}
        {% if post.external_source %}
        &nbsp; &middot; &nbsp; {{ post.external_source }}
        {% endif %}
      </p>
      <p class="post-tags">
          {% if categories != "" %}
          &nbsp; &middot; &nbsp;
            {% for category in post.categories %}
            <a href="{{ category | slugify | prepend: '/blog/category/' | prepend: site.baseurl}}">
              <i class="fa-solid fa-tag fa-sm"></i> {{ category }}</a>
              {% unless forloop.last %}
                &nbsp;
              {% endunless %}
              {% endfor %}
          {% endif %}
    </p>

{% if post.thumbnail %}

</div>

  <div class="col-sm-3">
    <img class="card-img" src="{{ post.thumbnail | relative_url }}" style="object-fit: cover; height: 90%" alt="image">
  </div>
</div>
{% endif %}
    </li>

    {% endfor %}

  </ul>

{% if page.pagination.enabled %}
{% include pagination.liquid %}
{% endif %}

  </div><!-- End blog-main-content -->

</div><!-- End blog-container -->

<!-- Hover-activated sidebar -->
<div class="category-sidebar-hover" aria-label="Categories">
  <div class="sidebar-tab">
    <span class="sidebar-tab-icon">☰</span>
    <span class="sidebar-tab-text">Categories</span>
  </div>
  <div class="sidebar-content">
    <h3 class="category-sidebar-title">Categories</h3>
    {% assign open_after = site.sidebar_open_categories | default: 0 %}
    {% for category in site.display_categories %}
      {% assign idx = forloop.index0 %}
      {% assign posts_in_cat = site.posts | where_exp: "post", "post.categories contains category" %}
      {% assign post_count = posts_in_cat | size %}
      {% if idx < open_after %}
        <details class="category-item" open>
      {% else %}
        <details class="category-item">
      {% endif %}
        <summary data-count="{{ post_count }}">{{ category }}</summary>
        <ul>
          {% for p in posts_in_cat %}
            <li><a href="{{ p.url | relative_url }}">{{ p.title }}</a></li>
          {% endfor %}
        </ul>
      </details>
    {% endfor %}
  </div>
</div>

</div><!-- End post -->
