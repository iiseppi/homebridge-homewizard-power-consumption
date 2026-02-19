import { API } from 'homebridge';
import { PLATFORM_NAME } from './settings';
import { HomewizardPowerConsumption } from './Platform';

export = (api: API) => {
  api.registerPlatform(PLATFORM_NAME, HomewizardPowerConsumption);
};
