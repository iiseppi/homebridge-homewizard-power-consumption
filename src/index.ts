import { API } from 'homebridge';
import { HomewizardPowerConsumption } from './Platform';

const FakeGatoHistoryService = require('fakegato-history');

export = (api: API) => {
  api.registerPlatform('HomewizardPowerConsumption', HomewizardPowerConsumption);
};
