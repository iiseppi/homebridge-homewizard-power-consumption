import { API, DynamicPlatformPlugin, Logger, PlatformAccessory, PlatformConfig, Service, Characteristic } from 'homebridge';
import axios from 'axios';
import { PLATFORM_NAME, PLUGIN_NAME } from './settings';
import PowerConsumption from './Accessories/PowerConsumption';
import PowerReturn from './Accessories/PowerReturn';

/**
 * HomeWizardPowerConsumption Platform
 */
export class HomewizardPowerConsumption implements DynamicPlatformPlugin {
  public readonly Service: typeof Service = this.api.hap.Service;
  public readonly Characteristic: typeof Characteristic = this.api.hap.Characteristic;

  // Used to track restored accessories from the cache
  public readonly accessories: PlatformAccessory[] = [];
  
  private heartBeatInterval: number;
  private devices: any[] = []; // Stores initialized accessory instances
  private deviceData: any;
  private apiPath = '/api/v1'; // Default, will be updated during initialization

  constructor(
    public readonly log: Logger,
    public readonly config: PlatformConfig,
    public readonly api: API,
  ) {
    // Default to 10s if not specified, as Eve History benefits from frequent updates
    this.heartBeatInterval = (config.pollInterval || 10) * 1000;

    this.log.debug('Platform initialized, waiting for Homebridge to finish launching...');

    this.api.on('didFinishLaunching', () => {
      this.initialise();
    });
  }

  /**
   * This function is invoked when Homebridge restores cached accessories from disk at startup.
   * It should be used to set up event handlers for characteristics and update respective values.
   */
  public configureAccessory(accessory: PlatformAccessory) {
    this.log.debug('Restoring existing accessory from cache:', accessory.displayName);
    this.accessories.push(accessory);
  }

  private validateConfig(): boolean {
    return !!this.config.ip;
  }

  /**
   * Discover the device and automatically detect if it supports API v2.
   */
  private async discoverDevice(): Promise<boolean> {
    const ip = this.config.ip;
    try {
      this.log.debug(`Attempting to connect to: ${ip} (Checking API v2)...`);
      const response = await axios.get(`http://${ip}/api/v2`, { timeout: 3000 });
      this.deviceData = response.data;
      this.apiPath = '/api/v2';
      this.log.info(`HomeWizard device identified! Using API v2.`);
      return true;
    } catch (error) {
      try {
        this.log.debug(`API v2 not reachable, attempting API v1...`);
        const response = await axios.get(`http://${ip}/api/v1`, { timeout: 3000 });
        this.deviceData = response.data;
        this.apiPath = '/api/v1';
        this.log.info(`HomeWizard device identified! Using API v1.`);
        return true;
      } catch (err) {
        return false;
      }
    }
  }

  private async initialise() {
    if (!this.validateConfig()) {
      this.log.error('Configuration error: Please provide the HomeWizard device IP address in settings.');
      return;
    }

    if (!await this.discoverDevice()) {
      this.log.error(`Connection to ${this.config.ip} failed. Please check the IP address and Local API settings.`);
      return;
    }

    this.setupAccessories();

    // Perform the first data fetch immediately
    await this.heartBeat();

    // Start the periodic update interval
    setInterval(() => {
      this.heartBeat();
    }, this.heartBeatInterval);
  }

  private setupAccessories() {
    // 1. Power Consumption Accessory
    const consumptionName = 'Power Consumption';
    const consumptionUuid = this.api.hap.uuid.generate('homewizard-power-consumption');
    const existingConsumption = this.accessories.find(acc => acc.UUID === consumptionUuid);

    if (this.config.hidePowerConsumptionDevice !== true) {
      if (existingConsumption) {
        this.log.debug('Restoring existing Power Consumption sensor');
        this.devices.push(new PowerConsumption(this.config, this.log, this.api, existingConsumption, this.deviceData));
      } else {
        this.log.info('Adding new Power Consumption sensor');
        const accessory = new this.api.platformAccessory(consumptionName, consumptionUuid);
        this.devices.push(new PowerConsumption(this.config, this.log, this.api, accessory, this.deviceData));
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }

    // 2. Power Return Accessory
    const returnName = 'Power Return';
    const returnUuid = this.api.hap.uuid.generate('homewizard-power-return');
    const existingReturn = this.accessories.find(acc => acc.UUID === returnUuid);

    if (this.config.hidePowerReturnDevice !== true) {
      if (existingReturn) {
        this.log.debug('Restoring existing Power Return sensor');
        this.devices.push(new PowerReturn(this.config, this.log, this.api, existingReturn, this.deviceData));
      } else {
        this.log.info('Adding new Power Return sensor');
        const accessory = new this.api.platformAccessory(returnName, returnUuid);
        this.devices.push(new PowerReturn(this.config, this.log, this.api, accessory, this.deviceData));
        this.api.registerPlatformAccessories(PLUGIN_NAME, PLATFORM_NAME, [accessory]);
      }
    }
  }

  /**
   * Fetch data from the device and broadcast it to all accessories via the 'beat' method.
   */
  private async heartBeat() {
    const url = `http://${this.config.ip}${this.apiPath}/data`;
    try {
      const { data } = await axios.get(url, { timeout: 5000 });
      
      // Update all initialized devices with the new data
      this.devices.forEach(device => {
        if (typeof device.beat === 'function') {
          device.beat(data);
        }
      });

      this.log.debug(`Data retrieval successful (${this.apiPath}): ${data.active_power_w} W`);
    } catch (error: any) {
      this.log.error(`Error retrieving data from (${url}): ${error.message}`);
    }
  }
}
