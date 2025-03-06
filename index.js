// Version 0.1
// Author: Gelloiss

// ============================
// Configuration and Constants
// ============================

// API Configuration
const API_CONFIG = {
    baseUrl: 'https://secondbuy.site/api'
  };
  
  // Constants
  const RAO = 10 ** -9; // Scaling factor for converting RAO to TAO
  
  const ENV = {
    colors: {
      bg: new Color('#0E0E0E'), // Background color
      neuron_bg: new Color('#1b1b1b'),
      neuron_err_bg: new Color('#4e0000'),
      err: new Color('#ad4904'),
      gold: new Color('#FDE047'), //For Stake
      white: Color.white(), // White for Daily Reward
      cyan_green: new Color('#00c2a6'), //For UIDs
  
      cyan_green_sim: new Color('#00c2b6'), //For TAO price
      orange_pearl: new Color('#e88148'), //For TAO
      gray: Color.gray(), // For secondary info
      forEvenRow: new Color('#74b9ff'),
      forNotEvenRow: new Color('#a29bfe'),
    },
    spacing: 4,
    part_spacing: 7,
    transverce_spacing: 15,
    refreshInterval: 300000,
  };
  
  // ============================
  // Main Execution
  // ============================
  
  let widgetParameters;
  if (config.runsInApp) {
    widgetParameters = '16 | 138, 39, 1, 2, 3, 4, 5, 6, 7'; // Required at least "zero". Defaults for debug in app
    config.widgetFamily = 'large'; // PREVIEW OF WIDGET IN APP (SMALL, MEDIUM or LARGE)
  } else {
    widgetParameters = args.widgetParameter;
  }
  
  try {
    const inputString = "16|1,2,3,4,5";
  
    // Split the string by `|` to separate netuid and uids
    const [netuidString, uidString] = widgetParameters.split('|');
  
    // Convert netuid to a number
    const netuid = parseInt(netuidString.trim(), 10);
  
    // Split uids by `,` and convert each to a number
    const uids = uidString.split(',').map(uid => parseInt(uid.trim(), 10));
  
    // Fetch price
    const prices = await fetchPrices(netuid);
  
    // Fetch all neuron data
    const neurons = await fetchNeuronsByUids(uids, prices, netuid);
    neurons.sort((a, b) => parseInt(a.uid) - parseInt(b.uid));
  
    const totals = calculateTotals(neurons);
  
    // Create the widget
    const widget = createWidget(neurons, prices, totals);
  
    if (!config.runsInWidget) {
      // Show Widget Preview
      switch (config.widgetFamily) {
        case 'small':
          await widget.presentSmall();
          break;
        case 'medium':
          await widget.presentMedium();
          break;
        case 'large':
          await widget.presentLarge();
          break;
      }
    } else {
      // Tell the system to show the widget.
      Script.setWidget(widget);
      Script.complete();
    }
  } catch (error) {
    console.error(error);
  }
  
  // ============================
  // Data Fetching Functions
  // ============================
  
  async function fetchNeuronsByUids(uids, prices, netuid) {
    const allNeurons = await fetchAllNeurons(netuid);
    try {
      return uids.map(uid => {
        // Find the neuron by UID in the pre-fetched neuron list
        const neuron = allNeurons.find(neuron => neuron.uid === parseInt(uid));
        const { alphaToTao, taoToUsdt } = prices;
  
        if (typeof neuron !== 'undefined') {
          const dailyAlphaToken = parseFloat(neuron.daily_reward) * RAO; //Дейли в токенах альфы
          const stakeAlphaToken = parseFloat(neuron.alpha_stake) * RAO; //Стейк альфа, сколько всего токенов на майнере
  
          const dailyTao = dailyAlphaToken * alphaToTao;
          const stakeTao = stakeAlphaToken * alphaToTao;
  
          const dailyUSD = dailyTao * taoToUsdt;
          const stakeUSD = stakeTao * taoToUsdt;
  
          return { uid, dailyAlphaToken, stakeAlphaToken, dailyTao, stakeTao, dailyUSD, stakeUSD };
        } else {
          return { uid, error: 'Neuron not found' };
        }
      });
    } catch (error) {
      console.error('Failed to fetch neurons:', error);
      return { uid: 0, error: 'Failed to process neuron data.' };
    }
  }
  
  function calculateTotals(neurons) {
    // Начальные значения тоталов
    const initialTotals = {
      dailyTotalAlphaToken: 0,
      stakeTotalAlphaToken: 0,
      dailyTotalTao: 0,
      stakeTotalTao: 0,
      dailyTotalUSD: 0,
      stakeTotalUSD: 0
    };
  
    return neurons.reduce((acc, neuron) => {
      if (!neuron.error) {
        acc.dailyTotalAlphaToken += neuron.dailyAlphaToken;
        acc.stakeTotalAlphaToken += neuron.stakeAlphaToken;
        acc.dailyTotalTao       += neuron.dailyTao;
        acc.stakeTotalTao       += neuron.stakeTao;
        acc.dailyTotalUSD       += neuron.dailyUSD;
        acc.stakeTotalUSD       += neuron.stakeUSD;
      }
      return acc;
    }, initialTotals);
  }
  
  async function fetchAllNeurons(netuid) {
    const url = `${ API_CONFIG.baseUrl }/metagraph/latest/v1?netuid=${ netuid }`;
    try {
      const response = await new Request(url).loadJSON();
  
      // Check if response.items exists and is an array
      if (!response || !Array.isArray(response.data)) {
        throw new Error('Invalid API response: "items" is missing or not an array.');
      }
  
      return response.data; // Return the full list of neurons
    } catch (error) {
      console.error('Error fetching neuron data:', error);
      return []; // Return an empty array in case of an error
    }
  }
  
  async function fetchPrices(netuid) {
    const prices = {
      alphaToTao: -1,
      taoToUsdt: -1,
    };
    //Price Alpha to TAO
    let req = new Request(`${API_CONFIG.baseUrl}/dtao/pool/v1?netuid=${netuid}`);
    try {
      const resp = await req.loadJSON();
      if (Array.isArray(resp?.data)) {
        prices.alphaToTao = resp.data[0].price;
      }
  
    } catch (e) {
      console.error('Error when call /dtao/pool/v1 ', e);
    }
  
    //Price TAO to USDT
    req = new Request(`${API_CONFIG.baseUrl}/price/latest/v1?asset=tao`);
    try {
      const resp = await req.loadJSON();
      if (Array.isArray(resp?.data)) {
        prices.taoToUsdt = resp.data[0].price;
      }
  
    } catch (e) {
      console.error('Error when call /price/latest/v1?asset=tao ', e);
    }
  
    return prices;
  }
  
  // ============================
  // Widget Creation Function
  // ============================
  
  function createWidget(neurons, prices, totals) {
    const widget = new ListWidget();
    widget.backgroundColor = ENV.colors.bg;
  
    const frame = widget.addStack();
    frame.spacing = ENV.part_spacing;
    frame.layoutVertically();
  
    switch (config.widgetFamily) {
      case 'small':
        drawTotalStack(frame, totals);
        drawPrices(frame, prices);
        drawFooterForSmall(frame, neurons);
      break;
      case 'large':
      case 'medium':
        const neuronsPanel = frame.addStack();
        const tableStacks = drawTableForLarge(neuronsPanel);
        drawNeuronsStatForLarge(neurons, tableStacks);
        drawTotalStackToTable(tableStacks, totals);
        const bottomPanel = frame.addStack();
        bottomPanel.layoutVertically();
        bottomPanel.addSpacer(5);
        drawPrices(bottomPanel, prices, true);
        drawTimeUpdated(bottomPanel);
        /*drawPrices(frame.addStack(), prices, true);
        drawTimeUpdated(frame.addStack());*/
      break;
    }
  
    widget.refreshAfterDate = new Date(Date.now() + ENV.refreshInterval);
    return widget;
  }
  
  function drawTotalStack(frame, totals) {
    // Создаем горизонтальный контейнер
    const rowStack = frame.addStack();
    rowStack.layoutHorizontally();
    // Можно добавить отступы со всех сторон при желании
    // rowStack.setPadding(0, 0, 0, 0);
  
    // Первый столбец (прижат к левому краю)
    const colTotalStake = rowStack.addStack();
    colTotalStake.layoutVertically();
  
    addSemiboldText(colTotalStake, '∑ Stake', 18, ENV.colors.gray);
    addSystemText(colTotalStake, `α${ totals.stakeTotalAlphaToken.toFixed(2) }`, 14, ENV.colors.cyan_green_sim);
    addSystemText(colTotalStake, `τ${ totals.stakeTotalTao.toFixed(2) }`, 14, ENV.colors.orange_pearl);
    addSystemText(colTotalStake, `$${ totals.stakeTotalUSD.toFixed(2) }`, 14, ENV.colors.gold);
  
    // Добавляем "промежуточный" Spacer, который вытолкнет второй столбец к правому краю
    rowStack.addSpacer();
  
    // Второй столбец (прижат к правому краю)
    const colTotalDaily = rowStack.addStack();
    colTotalDaily.layoutVertically();
  
    addSemiboldText(colTotalDaily, '∑ Daily', 13, ENV.colors.gray);
    addSystemText(colTotalDaily, `α${ totals.dailyTotalAlphaToken.toFixed(2) }`, 11, ENV.colors.cyan_green_sim);
    addSystemText(colTotalDaily, `τ${ totals.dailyTotalTao.toFixed(2) }`, 11, ENV.colors.orange_pearl);
    addSystemText(colTotalDaily, `$${ totals.dailyTotalUSD.toFixed(2) }`, 11, ENV.colors.gold);
  }
  
  function drawTotalStackToTable(stacks, totals) {
    const [col0, col1, col2] = stacks;
  
    addSemiboldText(col0, `∑`, 18, ENV.colors.cyan_green_sim);
    addSemiboldText(col1, `α${ totals.stakeTotalAlphaToken.toFixed(0) }  | t${ totals.stakeTotalTao.toFixed(2) } | $${ totals.stakeTotalUSD.toFixed(2) }`, 14, ENV.colors.orange_pearl);
    addSemiboldText(col2, `α${ totals.dailyTotalAlphaToken.toFixed(0) } | t${ totals.dailyTotalTao.toFixed(2) } | $${ totals.dailyTotalUSD.toFixed(2) }`, 14, ENV.colors.gold);
  }
  
  function drawFooterForSmall(frame, neurons) {
    const bottomStack = frame.addStack();
    bottomStack.layoutVertically();
  
    const uidStack = bottomStack.addStack();
    uidStack.spacing = 3;
    {
      uidStack.addSpacer();
  
      addSemiboldText(uidStack, 'UIDs: ', 11, ENV.colors.gray);
  
      neurons.forEach(neuron => {
        if (!neuron.error) {
          addSemiboldText(uidStack, `${ neuron.uid }`, 11, ENV.colors.cyan_green);
        } else {
          addSemiboldText(uidStack, `${ neuron.uid }`, 11, ENV.colors.err);
        }
      });
  
      uidStack.addSpacer();
    }
  
    drawTimeUpdated(bottomStack);
  }
  
  function drawTimeUpdated(stack) {
    // Last Updated at the bottom of the widget
    const timeStack = stack.addStack();
    timeStack.addSpacer();
  
    addSystemText(timeStack, 'Sync: ', 11, ENV.colors.gray);
  
    let nowUpdatedDate = timeStack.addDate(new Date());
    nowUpdatedDate.textColor = ENV.colors.gray;
    nowUpdatedDate.font = Font.systemFont(11);
    nowUpdatedDate.applyTimeStyle();
  
    timeStack.addSpacer();
  }
  
  function drawPrices(frame, prices, isLarge = false) {
    // Основной горизонтальный контейнер
    const rowStack = frame.addStack();
    rowStack.layoutHorizontally();
    // (Опционально) rowStack.centerAlignContent() или rowStack.topAlignContent() и т.п.
  
    // 1-я колонка
    const col1 = rowStack.addStack();
    col1.layoutVertically();
    addSemiboldText(col1, `1τ = `, 11, ENV.colors.orange_pearl);
  
    // Небольшой отступ между колонками
    if (isLarge) {
      rowStack.addSpacer();
    } else
      rowStack.addSpacer(5);
  
    // 2-я колонка
    const col2 = rowStack.addStack();
    col2.layoutVertically();
    addSemiboldText(
      col2,
      `α${(1 / prices.alphaToTao).toFixed(2)}`,
      11,
      ENV.colors.cyan_green_sim
    );
  
    // Снова отступ
    if (isLarge) {
      rowStack.addSpacer();
    } else
      rowStack.addSpacer(5);
  
    // 3-я колонка
    const col3 = rowStack.addStack();
    col3.layoutVertically();
    addSemiboldText(
      col3,
      `$${parseFloat(prices.taoToUsdt).toFixed(2)}`,
      11,
      ENV.colors.gold
    );
  }
  
  function drawTableForLarge(frame) { //Вощвращает массив созданных колонок
    const uidStack = frame.addStack();
    uidStack.spacing = ENV.spacing;
    uidStack.layoutVertically();
    addSemiboldText(uidStack, 'UIDs', 13, ENV.colors.cyan_green);
  
    frame.addSpacer(); // Flexible spacer
  
    const stakeStack = frame.addStack();
    stakeStack.spacing = ENV.spacing;
    stakeStack.layoutVertically();
    addSemiboldText(stakeStack, 'Stake', 13, ENV.colors.gold);
  
    frame.addSpacer(); // Flexible spacer
  
    const dailyStack = frame.addStack();
    dailyStack.spacing = ENV.spacing;
    dailyStack.layoutVertically();
    addSemiboldText(dailyStack, 'Daily', 13, ENV.colors.white);
  
    return [uidStack, stakeStack, dailyStack];
  }
  
  function drawNeuronsStatForLarge(neurons, stacks) {
    const [uidStack, stakeStack, dailyStack] = stacks;
  
    neurons.forEach((neuron, i) => {
      const currentColor = i % 2 === 0 ? ENV.colors.forEvenRow : ENV.colors.forNotEvenRow;
  
      if (!neuron.error) {
        addSemiboldText(uidStack, `${ neuron.uid }`, 12, currentColor);
        addSemiboldText(stakeStack, `α${ neuron.stakeAlphaToken.toFixed(1) } | t${ neuron.stakeTao.toFixed(2) } | $${ neuron.stakeUSD.toFixed(0) }`, 12, currentColor);
        addSemiboldText(dailyStack, `α${ neuron.dailyAlphaToken.toFixed(2) } | $${ neuron.dailyUSD.toFixed(2) }`, 12, currentColor);
      } else {
        addSemiboldText(frame, `UID ${ neuron.uid }: ${ neuron.error }`, 12, ENV.colors.err);
      }
    });
  }
  
  function addSemiboldText(frame, text, size, color) {
    let stackText = frame.addText(text);
    stackText.font = Font.semiboldSystemFont(size);
    stackText.textColor = color;
  }
  
  function addSystemText(frame, text, size, color) {
    let stackText = frame.addText(text);
    stackText.font = Font.systemFont(size);
    stackText.textColor = color;
  }
  