# Silences Dart Sass deprecation warnings that jekyll-sass-converter 3.x doesn't
# expose via _config.yml. The `sass-embedded` gem supports `silence_deprecations`
# but the converter's sass_configs method doesn't pass it through.
#
# - import:        @import rules (deprecated in Dart Sass, removed in 3.0)
# - global-builtin: unquote(), str-insert() etc. used without `sass:string` prefix
#                   (appears in vendored font-awesome and tabler-icons partials)
module Jekyll
  module Converters
    class Scss
      private

      alias_method :sass_configs_without_silence, :sass_configs

      def sass_configs
        sass_configs_without_silence.merge(
          silence_deprecations: %w[import global-builtin]
        )
      end
    end
  end
end
