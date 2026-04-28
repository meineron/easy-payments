module.exports = {
  plugins: {
    // Tailwind scoped to the easy-payments submodule only
    tailwindcss: {
      config: "./tailwind.payments.config.js",
    },
    autoprefixer: {},
  },
};
