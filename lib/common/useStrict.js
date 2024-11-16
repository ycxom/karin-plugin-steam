"use strict";

/**
 * Randomizes the puppeteer fingerprint
 * @return {object}
 */
export const protectPage = (page, options = {}) => {
  page.evaluateOnNewDocument(
    (options) => {
      window.afpOptions = options;
      // Canvas Def
      const getImageData = CanvasRenderingContext2D.prototype.getImageData;

      const noisify = (canvas, context) => {
        if (context) {
          const shift = {
            r: window.afpOptions.options.canvasRgba
              ? window.afpOptions.options.canvasRgba[0]
              : Math.floor(Math.random() * 10) - 5,
            g: window.afpOptions.options.canvasRgba
              ? window.afpOptions.options.canvasRgba[1]
              : Math.floor(Math.random() * 10) - 5,
            b: window.afpOptions.options.canvasRgba
              ? window.afpOptions.options.canvasRgba[2]
              : Math.floor(Math.random() * 10) - 5,
            a: window.afpOptions.options.canvasRgba
              ? window.afpOptions.options.canvasRgba[3]
              : Math.floor(Math.random() * 10) - 5,
          };
          const width = canvas.width;
          const height = canvas.height;

          if (width && height) {
            const imageData = getImageData.apply(context, [
              0,
              0,
              width,
              height,
            ]);

            for (let i = 0; i < height; i++)
              for (let j = 0; j < width; j++) {
                const n = i * (width * 4) + j * 4;
                imageData.data[n + 0] = imageData.data[n + 0] + shift.r;
                imageData.data[n + 1] = imageData.data[n + 1] + shift.g;
                imageData.data[n + 2] = imageData.data[n + 2] + shift.b;
                imageData.data[n + 3] = imageData.data[n + 3] + shift.a;
              }

            context.putImageData(imageData, 0, 0);
          }
        }
      };

      HTMLCanvasElement.prototype.toBlob = new Proxy(
        HTMLCanvasElement.prototype.toBlob,
        {
          apply(target, self, args) {
            noisify(self, self.getContext("2d"));

            return Reflect.apply(target, self, args);
          },
        }
      );

      HTMLCanvasElement.prototype.toDataURL = new Proxy(
        HTMLCanvasElement.prototype.toDataURL,
        {
          apply(target, self, args) {
            noisify(self, self.getContext("2d"));

            return Reflect.apply(target, self, args);
          },
        }
      );

      CanvasRenderingContext2D.prototype.getImageData = new Proxy(
        CanvasRenderingContext2D.prototype.getImageData,
        {
          apply(target, self, args) {
            noisify(self.canvas, self);

            return Reflect.apply(target, self, args);
          },
        }
      );

      // WebGL Def
      const config = {
        random: {
          value: () => Math.random(),
          item: (e) => e[Math.floor(e.length * config.random.value())],
          number: (power) => config.random.item(power.map(p => Math.pow(2, p))),
          int: (power) => config.random.item(power.map(p => new Int32Array([Math.pow(2, p), Math.pow(2, p)]))),
          float: (power) => config.random.item(power.map(p => new Float32Array([1, Math.pow(2, p)]))),
        },
        spoof: {
          webgl: {
            buffer: (target) => {
              const proto = target.prototype || target.__proto__;
              proto.bufferData = new Proxy(proto.bufferData, {
                apply(target, self, args) {
                  const index = Math.floor(config.random.value() * args[1].length);
                  args[1][index] += args[1][index] !== undefined ? 0.1 * config.random.value() * args[1][index] : 0;
                  return Reflect.apply(target, self, args);
                },
              });
            },
            parameter: (target) => {
              const proto = target.prototype || target.__proto__;
              proto.getParameter = new Proxy(proto.getParameter, {
                apply(target, receiver, args) {
                  // Custom spoofing logic for WebGL
                  const spoofedResults = {
                    3415: 0,
                    3414: 24,
                    36348: 30,
                    7936: "WebKit",
                    37445: "Google Inc.",
                    7937: "WebKit WebGL",
                    3379: config.random.number([14, 15]),
                    36347: config.random.number([12, 13]),
                    34076: config.random.number([14, 15]),
                    34024: config.random.number([14, 15]),
                    3386: config.random.int([13, 14, 15]),
                    3413: config.random.number([1, 2, 3, 4]),
                    3412: config.random.number([1, 2, 3, 4]),
                    3411: config.random.number([1, 2, 3, 4]),
                    3410: config.random.number([1, 2, 3, 4]),
                    34047: config.random.number([1, 2, 3, 4]),
                    34930: config.random.number([1, 2, 3, 4]),
                    34921: config.random.number([1, 2, 3, 4]),
                    35660: config.random.number([4, 5, 6, 7, 8]),
                    35661: config.random.number([4, 5, 6, 7, 8]),
                    36349: config.random.number([10, 11, 12, 13]),
                    33902: config.random.float([0, 10, 11, 12, 13]),
                    33901: config.random.float([0, 10, 11, 12, 13]),
                    37446: config.random.item(["Graphics", "HD Graphics", "Intel(R) HD Graphics"]),
                    7938: config.random.item(["WebGL 1.0", "WebGL 1.0 (OpenGL)", "WebGL 1.0 (OpenGL Chromium)"]),
                    35724: config.random.item(["WebGL", "WebGL GLSL", "WebGL GLSL ES", "WebGL GLSL ES (OpenGL Chromium)"]),
                  };
                  return spoofedResults[args[0]] || Reflect.apply(target, receiver, args);
                },
              });
            },
          },
        },
      };

      config.spoof.webgl.buffer(WebGLRenderingContext);
      config.spoof.webgl.buffer(WebGL2RenderingContext);
      config.spoof.webgl.parameter(WebGLRenderingContext);
      config.spoof.webgl.parameter(WebGL2RenderingContext);

      // Font Def
      const rand = {
        noise: () => window.afpOptions.options.fontFingerprint?.noise || Math.floor(Math.random() + Math.sign(Math.random() - 0.5)),
        sign: () => [-1, 1][Math.floor(Math.random() * 2)],
      };

      Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
        get: new Proxy(Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight").get, {
          apply(target, self, args) {
            const height = Math.floor(self.getBoundingClientRect().height);
            return height ? height + rand.noise() * rand.sign() : height;
          },
        }),
      });

      Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
        get: new Proxy(Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth").get, {
          apply(target, self, args) {
            const width = Math.floor(self.getBoundingClientRect().width);
            return width ? width + rand.noise() * rand.sign() : width;
          },
        }),
      });

      // Audio Def
      const context = {
        BUFFER: null,
        getChannelData: function (e) {
          e.prototype.getChannelData = new Proxy(e.prototype.getChannelData, {
            apply(target, self, args) {
              const results = Reflect.apply(target, self, args);
              if (context.BUFFER !== results) {
                context.BUFFER = results;
                for (let i = 0; i < results.length; i += 100) {
                  const index = Math.floor(Math.random() * i);
                  results[index] += Math.random() * 0.0000001;
                }
              }
              return results;
            },
          });
        },
        createAnalyser: function (e) {
          e.prototype.__proto__.createAnalyser = new Proxy(e.prototype.__proto__.createAnalyser, {
            apply(target, self, args) {
              const analyser = Reflect.apply(target, self, args);
              analyser.__proto__.getFloatFrequencyData = new Proxy(analyser.__proto__.getFloatFrequencyData, {
                apply(target, self, args) {
                  const results = Reflect.apply(target, self, args);
                  for (let i = 0; i < args[0].length; i += 100) {
                    const index = Math.floor(Math.random() * i);
                    args[0][index] += Math.random() * 0.1;
                  }
                  return results;
                },
              });
              return analyser;
            },
          });
        },
      };

      context.getChannelData(AudioBuffer);
      context.createAnalyser(AudioContext);
      context.createAnalyser(OfflineAudioContext);
      if (window.afpOptions.options.webRTCProtect) {
        navigator.mediaDevices.getUserMedia = undefined;
      }
      delete navigator.webdriver;
    },
    { options }
  );
  return page;
};

export const protectedBrowser = async (browser, options = {}) => {
  const protectedBrowser = browser;
  protectedBrowser.newProtectedPage = async () => {
    const page = await browser.newPage();
    await protectPage(page, options);
    return page;
  };
  return protectedBrowser;
};
